#!/usr/bin/env bash
# Exercise scripts/publish.sh against a fake npm, so the auth fallback logic is
# proved before a tag touches the registry.
#
# The workflow calls that same script, so this cannot drift from what CI runs.
# Needs only bash — no node, no network, no credentials.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/../scripts/publish.sh"

if [ ! -f "$SCRIPT" ]; then
  echo "missing $SCRIPT"
  exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

pass=0
fail=0
ok()   { printf 'ok - %s\n' "$1"; pass=$((pass + 1)); }
nope() { printf 'NOT OK - %s\n' "$1"; fail=$((fail + 1)); }

# A fake npm whose behaviour is driven by FAKE_* env vars; every call is logged.
mkdir -p "$WORK/bin"
cat > "$WORK/bin/npm" <<'FAKE'
#!/usr/bin/env bash
echo "npm $*" >> "$FAKE_LOG"
case "$1 $2" in
  "publish --access")
    if [ "${FAKE_DIRECT:-ok}" = "ok" ]; then
      echo "success: published"
      exit 0
    fi
    echo "npm error code ${FAKE_DIRECT_CODE:-E403}"
    echo "npm error 403 403 Forbidden - PUT https://registry.npmjs.org/pkg - ${FAKE_DIRECT_MSG:-OIDC permission denied for this action}"
    exit 1
    ;;
  "stage publish")
    if [ "${FAKE_STAGE:-ok}" = "ok" ]; then
      echo "success: staged"
      exit 0
    fi
    echo "npm error ${FAKE_STAGE_MSG:-already staged}"
    exit 1
    ;;
  *)
    echo "unexpected npm call: $*" >&2
    exit 1
    ;;
esac
FAKE
chmod +x "$WORK/bin/npm"

# $1 token state; rest are KEY=VALUE overrides for the fake npm.
run_case() {
  local token="$1"
  shift
  local gh="$WORK/github_output"
  : > "$gh"; : > "$WORK/npm.log"
  ( cd "$WORK" && \
    env PATH="$WORK/bin:$PATH" \
      FAKE_LOG="$WORK/npm.log" \
      GITHUB_OUTPUT="$gh" \
      NPM_TOKEN_STATE="$token" \
      "$@" \
      bash "$SCRIPT" ) > "$WORK/out" 2>&1
  CASE_STATUS=$?
  CASE_GH="$(cat "$gh")"
  CASE_NPM="$(cat "$WORK/npm.log")"
  CASE_OUT="$(cat "$WORK/out")"
}

expect()   { if [ "$2" = "$3" ]; then ok "$1"; else nope "$1 (expected '$2', got '$3')"; fi; }
contains() { case "$3" in *"$2"*) ok "$1" ;; *) nope "$1 (missing '$2'; output: $(printf '%s' "$3" | tr '\n' ' '))" ;; esac; }
lacks()    { case "$3" in *"$2"*) nope "$1 (unexpected '$2')" ;; *) ok "$1" ;; esac; }

# 1. usable token, direct publish succeeds
run_case usable FAKE_DIRECT=ok
expect   "token: direct publish succeeds" 0 "$CASE_STATUS"
contains "token: records published" "mode=published" "$CASE_GH"
contains "token: records via=token" "via=token" "$CASE_GH"
contains "token: called npm publish" "npm publish --access public --provenance" "$CASE_NPM"
lacks    "token: never stages" "stage publish" "$CASE_NPM"

# 2. usable token, direct publish fails -> fatal, no fallback to staging
run_case usable FAKE_DIRECT=fail FAKE_DIRECT_CODE=E500 FAKE_DIRECT_MSG="internal server error"
expect "token: a real publish failure is fatal" 1 "$CASE_STATUS"
lacks  "token: does not silently stage" "stage publish" "$CASE_NPM"

# 3. no token, OIDC direct publish succeeds
run_case absent FAKE_DIRECT=ok
expect   "oidc: direct publish succeeds" 0 "$CASE_STATUS"
contains "oidc: records published" "mode=published" "$CASE_GH"
contains "oidc: records via=oidc" "via=oidc" "$CASE_GH"

# 4. no token, stage-only trusted publisher -> staged
run_case absent FAKE_DIRECT=fail FAKE_STAGE=ok
expect   "oidc: stage-only publisher stages instead" 0 "$CASE_STATUS"
contains "oidc: records staged" "mode=staged" "$CASE_GH"
contains "oidc: called npm stage publish" "stage publish" "$CASE_NPM"

# 5. no token, unrelated OIDC error -> fatal, must not try staging
run_case absent FAKE_DIRECT=fail FAKE_DIRECT_CODE=ENEEDAUTH FAKE_DIRECT_MSG="need auth"
expect "oidc: unrelated errors stay fatal" 1 "$CASE_STATUS"
lacks  "oidc: does not stage on an unrelated error" "stage publish" "$CASE_NPM"

# 6. no token, version already staged (re-run of a tag)
run_case absent FAKE_DIRECT=fail FAKE_STAGE=already FAKE_STAGE_MSG="already staged version 1.3.4"
expect   "oidc: re-running a staged tag is not an error" 0 "$CASE_STATUS"
contains "oidc: still records staged" "mode=staged" "$CASE_GH"

# 7. token present but rejected -> behave as absent
run_case rejected FAKE_DIRECT=ok
expect   "rejected token: falls back to OIDC" 0 "$CASE_STATUS"
contains "rejected token: records via=oidc" "via=oidc" "$CASE_GH"

# 8. staging fails for another reason -> fatal
run_case absent FAKE_DIRECT=fail FAKE_STAGE=fail FAKE_STAGE_MSG="ETIMEDOUT network unreachable"
expect "oidc: a staging failure is fatal" 1 "$CASE_STATUS"

# 9. the tag-match guard that runs before this script is unaffected by it
run_case usable FAKE_DIRECT=ok
lacks "the publish step never checks the tag itself" "git " "$CASE_OUT"

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]

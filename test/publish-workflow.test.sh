#!/usr/bin/env bash
# Exercise scripts/publish.sh against a fake npm, so the recovery logic is proved
# before a tag touches the registry.
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

# $1 and rest are KEY=VALUE overrides for the fake npm.
run_case() {
  local gh="$WORK/github_output"
  : > "$gh"; : > "$WORK/npm.log"
  ( cd "$WORK" && \
    env PATH="$WORK/bin:$PATH" \
      FAKE_LOG="$WORK/npm.log" \
      GITHUB_OUTPUT="$gh" \
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

# 1. a direct publish that works
run_case FAKE_DIRECT=ok
expect   "direct publish succeeds" 0 "$CASE_STATUS"
contains "records published" "mode=published" "$CASE_GH"
contains "called npm publish with provenance" "npm publish --access public --provenance" "$CASE_NPM"
lacks    "does not stage when publishing worked" "stage publish" "$CASE_NPM"

# 2. stage-only trusted publisher -> staged, not failed
run_case FAKE_DIRECT=fail FAKE_STAGE=ok
expect   "a stage-only trusted publisher stages instead" 0 "$CASE_STATUS"
contains "records staged" "mode=staged" "$CASE_GH"
contains "called npm stage publish" "stage publish" "$CASE_NPM"

# 3. an unrelated publish error stays fatal and never stages
run_case FAKE_DIRECT=fail FAKE_DIRECT_CODE=ENEEDAUTH FAKE_DIRECT_MSG="need auth"
expect "an unrelated publish error is fatal" 1 "$CASE_STATUS"
lacks  "does not stage on an unrelated error" "stage publish" "$CASE_NPM"

# 4. re-running a tag whose version is already staged is not an error
run_case FAKE_DIRECT=fail FAKE_STAGE=already FAKE_STAGE_MSG="already staged version 1.3.4"
expect   "re-running a staged tag is not an error" 0 "$CASE_STATUS"
contains "still records staged" "mode=staged" "$CASE_GH"

# 5. a staging failure for another reason is fatal
run_case FAKE_DIRECT=fail FAKE_STAGE=fail FAKE_STAGE_MSG="ETIMEDOUT network unreachable"
expect "a staging failure is fatal" 1 "$CASE_STATUS"

# 6. the fatal path must say how to fix it — a bare "it failed" is not actionable
run_case FAKE_DIRECT=fail FAKE_DIRECT_CODE=ENEEDAUTH FAKE_DIRECT_MSG="need auth"
contains "names the trusted-publisher setting" "Trusted publishing" "$CASE_OUT"

# 7. Regression: npm reports the OIDC refusal even when a token authenticated.
#    The publish attempt must not assume the credential it intended was the one
#    npm used, so this still recovers by staging.
run_case FAKE_DIRECT=fail FAKE_STAGE=ok
contains "recovers from the OIDC refusal regardless of which credential was meant" "stage publish" "$CASE_NPM"

# 8. the script never tries to reinterpret the tag or the manifest itself
run_case FAKE_DIRECT=ok
lacks "does not check the tag itself" "git " "$CASE_OUT"

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]

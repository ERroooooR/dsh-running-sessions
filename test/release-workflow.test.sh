#!/usr/bin/env bash
# Exercise scripts/release.sh against a fake gh and git, so the Release step is
# proved before a release touches GitHub.
#
# The workflow calls that same script, so this cannot drift from what CI runs.
# Needs only bash and node — no network, no credentials.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/../scripts/release.sh"
REPO="$HERE/.."

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

mkdir -p "$WORK/release" "$WORK/bin"
printf 'fake tarball\n' > "$WORK/release/dsh-running-sessions.tgz"
cp "$REPO/package.json" "$WORK/package.json"

cat > "$WORK/bin/gh" <<'FAKE'
#!/usr/bin/env bash
echo "gh $*" >> "$FAKE_LOG"
case "$1 $2" in
  "release view")
    [ "${FAKE_EXISTS:-no}" = "yes" ] || { echo "release not found" >&2; exit 1; }
    echo '{"tagName":"v-x"}'
    ;;
  "release upload")
    [ "${FAKE_UPLOAD:-ok}" = "ok" ] || { echo "upload failed" >&2; exit 1; }
    echo "uploaded"
    ;;
  "release create")
    [ "${FAKE_CREATE:-ok}" = "ok" ] || { echo "create failed" >&2; exit 1; }
    echo "created"
    ;;
  *) echo "unexpected gh call: $*" >&2; exit 1 ;;
esac
FAKE
chmod +x "$WORK/bin/gh"

run_case() {
  local gh="$WORK/github_output"
  : > "$gh"; : > "$WORK/gh.log"
  ( cd "$WORK" && \
    env PATH="$WORK/bin:$PATH" \
      FAKE_LOG="$WORK/gh.log" \
      GITHUB_OUTPUT="$gh" \
      GITHUB_SHA="deadbeef" \
      "$@" \
      bash "$SCRIPT" ) > "$WORK/out" 2>&1
  CASE_STATUS=$?
  CASE_GH="$(cat "$gh")"
  CASE_GH_CALLS="$(cat "$WORK/gh.log")"
  CASE_OUT="$(cat "$WORK/out")"
}

expect()   { if [ "$2" = "$3" ]; then ok "$1"; else nope "$1 (expected '$2', got '$3')"; fi; }
contains() { case "$3" in *"$2"*) ok "$1" ;; *) nope "$1 (missing '$2'; saw: $(printf '%s' "$3" | tr '\n' ' '))" ;; esac; }
lacks()    { case "$3" in *"$2"*) nope "$1 (unexpected '$2')" ;; *) ok "$1" ;; esac; }

# 1. no release yet -> created, tagged at the released commit
run_case FAKE_EXISTS=no
expect   "a missing release is created" 0 "$CASE_STATUS"
contains "records the derived tag" "tag=v" "$CASE_GH"
contains "records mode=created" "mode=created" "$CASE_GH"
contains "targets the released commit" "--target deadbeef" "$CASE_GH_CALLS"
contains "attaches the tarball" "release/dsh-running-sessions.tgz" "$CASE_GH_CALLS"
lacks    "does not upload into a release it just created" "release upload" "$CASE_GH_CALLS"

# 2. the tag comes from package.json, never from GITHUB_REF_NAME
expected_tag="v$(node -p "require('$WORK/package.json').version")"
run_case FAKE_EXISTS=no
contains "tag matches package.json" "Releasing $expected_tag" "$CASE_OUT"

# 3. release already there -> asset replaced, not a second release
run_case FAKE_EXISTS=yes FAKE_UPLOAD=ok
expect   "an existing release is refreshed" 0 "$CASE_STATUS"
contains "records mode=updated" "mode=updated" "$CASE_GH"
contains "clobbers the asset" "--clobber" "$CASE_GH_CALLS"
lacks    "does not create a duplicate release" "release create" "$CASE_GH_CALLS"

# 4. creation failure is fatal
run_case FAKE_EXISTS=no FAKE_CREATE=fail
expect "a create failure is fatal" 1 "$CASE_STATUS"

# 5. upload failure is fatal
run_case FAKE_EXISTS=yes FAKE_UPLOAD=fail
expect "an upload failure is fatal" 1 "$CASE_STATUS"

# 6. nothing here pushes a ref; --target is what creates a missing tag
run_case FAKE_EXISTS=no
lacks "does not run git push" "git push" "$CASE_OUT"
lacks "does not run git tag" "git tag" "$CASE_OUT"

# 7. a dispatch run has no tag name, so the Release is never named after the branch
run_case FAKE_EXISTS=no
lacks "does not use a branch name as the tag" 'GITHUB_REF_NAME' "$CASE_OUT"

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]

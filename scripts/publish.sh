#!/usr/bin/env bash
# Publish to npm.
#
# Called by .github/workflows/publish.yml. Kept as a file rather than inline YAML
# so the fallback logic can be exercised against a fake npm
# (test/publish-workflow.test.sh) instead of only in a real release.
#
# Which credential npm uses is not ours to choose: when the package has a trusted
# publisher configured, npm authenticates with OIDC and ignores an .npmrc token,
# even one it accepts from `npm whoami`. So this does not branch on "token vs
# OIDC" for the publish attempt — it attempts a direct publish once and only
# recovers from the one refusal that means something actionable.
#
# Inputs (env):
#   GITHUB_OUTPUT   set by Actions; this writes mode= and via= to it
#
# Exit status is the step's status: non-zero fails the release.

set -uo pipefail

LAST_OUTPUT=""

# Runs npm, prints its output, and returns its status without tripping `set -e`.
publish_once() {
  local out status
  set +e
  out="$("$@" 2>&1)"
  status=$?
  set -e
  printf '%s\n' "$out"
  LAST_OUTPUT="$out"
  return $status
}

emit() { printf '%s\n' "$1" >> "${GITHUB_OUTPUT:-/dev/null}"; }

if publish_once npm publish --access public --provenance; then
  emit "mode=published"
  exit 0
fi

# The one refusal that is recoverable, and the only error this script interprets.
# A trusted publisher created after 2026-09-03 defaults to allowing `npm stage
# publish` but not `npm publish`, so a direct publish is refused here even though
# authentication itself succeeded.
if ! printf '%s' "$LAST_OUTPUT" | grep -q 'OIDC permission denied for this action'; then
  echo "::error::npm publish failed for a reason other than a stage-only trusted publisher."
  echo "::error::To publish directly, tick \"npm publish\" under the package's Trusted publishing settings, or remove the trusted publisher so a token is used instead."
  exit 1
fi

echo "::notice::This trusted publisher allows staged publishing only; staging for approval."
if publish_once npm stage publish --access public --provenance; then
  emit "mode=staged"
  exit 0
fi

# Re-running a tag must not fail merely because the version is already staged.
if printf '%s' "$LAST_OUTPUT" | grep -qi 'already'; then
  echo "::notice::This version is already staged; nothing to do."
  emit "mode=staged"
  exit 0
fi

echo "::error::npm stage publish failed."
exit 1

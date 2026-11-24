#!/usr/bin/env bash
# Publish to npm, choosing an auth path.
#
# Called by .github/workflows/publish.yml. Kept as a file rather than inline YAML
# so the fallback logic can be exercised against a fake npm
# (test/publish-workflow.test.sh) instead of only in a real release.
#
# Inputs (env):
#   NPM_TOKEN_STATE   "usable" | "rejected" | "absent" — decided by the caller
#   GITHUB_OUTPUT     set by Actions; this writes mode= and via= to it
#
# Exit status is the step's status: non-zero fails the release.

set -uo pipefail

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

# A granular token with publish rights is the path that has actually shipped a
# release here, so it is tried first. It also bypasses the stage-only default that
# a trusted publisher created after 2026-09-03 carries.
if [ "${NPM_TOKEN_STATE:-absent}" = "usable" ]; then
  echo "::notice::Publishing with NPM_TOKEN."
  if publish_once npm publish --access public --provenance; then
    emit "mode=published"
    emit "via=token"
    exit 0
  fi
  echo "::error::npm publish with NPM_TOKEN failed."
  exit 1
fi

echo "::notice::No usable token; trying OIDC direct publish."
if publish_once npm publish --access public --provenance; then
  emit "mode=published"
  emit "via=oidc"
  exit 0
fi

# The one refusal that means "this trusted publisher may only stage". Everything
# else is a real error and must not be papered over.
if ! printf '%s' "$LAST_OUTPUT" | grep -q 'OIDC permission denied for this action'; then
  echo "::error::OIDC publish failed for a reason other than a stage-only trusted publisher."
  exit 1
fi

echo "::notice::This trusted publisher allows staged publishing only; staging for approval."
if publish_once npm stage publish --access public --provenance; then
  emit "mode=staged"
  emit "via=oidc"
  exit 0
fi

# Re-running a tag must not fail merely because the version is already staged.
if printf '%s' "$LAST_OUTPUT" | grep -qi 'already'; then
  echo "::notice::This version is already staged; nothing to do."
  emit "mode=staged"
  emit "via=oidc"
  exit 0
fi

echo "::error::npm stage publish failed."
exit 1

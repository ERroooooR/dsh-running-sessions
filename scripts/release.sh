#!/usr/bin/env bash
# Create or refresh the GitHub Release for the version in package.json.
#
# Called by .github/workflows/publish.yml. Kept as a file rather than inline YAML
# so the behaviour can be exercised against a fake `gh` and `git`
# (test/release-workflow.test.sh) instead of only during a real release.
#
# Inputs (env):
#   GITHUB_SHA   the commit the Release should point at (set by Actions)
#   GH_TOKEN     read by `gh`
#   GITHUB_OUTPUT  optional; this writes tag= and mode= to it
#
# Exit status is the step's status: non-zero fails the release.

set -uo pipefail

ASSET="release/dsh-running-sessions.tgz"

emit() { printf '%s\n' "$1" >> "${GITHUB_OUTPUT:-/dev/null}"; }

tag="v$(node -p "require('./package.json').version")"
echo "Releasing $tag"
emit "tag=$tag"

# The tag is not created with `git tag` + `git push`: `gh release create --target`
# creates it at the released commit when it is missing, and ignores --target when it
# already exists. That covers a tag push and a workflow_dispatch run with one path,
# and avoids pushing refs from a step whose job is to publish an artifact.
if gh release view "$tag" >/dev/null 2>&1; then
  echo "::notice::Release $tag exists; replacing its asset."
  if ! gh release upload "$tag" "$ASSET" --clobber; then
    echo "::error::could not upload $ASSET to the existing release $tag."
    exit 1
  fi
  emit "mode=updated"
  exit 0
fi

if gh release create "$tag" \
  --title "$tag" \
  --generate-notes \
  --target "${GITHUB_SHA:-main}" \
  "$ASSET"; then
  emit "mode=created"
  exit 0
fi

echo "::error::could not create the GitHub Release $tag."
exit 1

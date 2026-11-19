#!/usr/bin/env bash
# Publish the GitHub release for the legacy-v* tag in CIRCLE_TAG, with the
# two executables from the directory given as the only argument.
#
# The repository has immutable releases: after a release is published, its
# files and tag can't change. So create the release as a draft, upload the
# files, and publish it last. A rerun finishes a draft that an earlier run
# left behind, and stops without changes if the release is already published.
#
# gh reads GITHUB_TOKEN from the environment. Don't print it.
set -euo pipefail

: "${CIRCLE_TAG:?Run this for a legacy-v* tag.}"
: "${CIRCLE_SHA1:?}"
: "${GITHUB_TOKEN:?Add the github-releases context to this job.}"
export GH_REPO=ddelvalfraire/cousins-lab-tools

dir=${1:?Pass the directory that has the executables.}
files=("$dir/LabView_module_1.exe" "$dir/LabView_module_2.exe")

prerelease=false
if [[ $CIRCLE_TAG =~ -rc\.[0-9]+$ ]]; then
  prerelease=true
fi

# gh finds a published release by its tag, or a draft by its pending tag.
err=$(mktemp)
if is_draft=$(gh release view "$CIRCLE_TAG" --json isDraft --jq .isDraft 2> "$err"); then
  if [[ $is_draft != true ]]; then
    echo "$CIRCLE_TAG is already released; tag a new version." >&2
    exit 1
  fi
  echo "Replacing the files of the unpublished draft for $CIRCLE_TAG."
  gh release upload "$CIRCLE_TAG" "${files[@]}" --clobber
elif [[ $(< "$err") == "release not found" ]]; then
  echo "Creating a draft release for $CIRCLE_TAG."
  gh release create "$CIRCLE_TAG" "${files[@]}" --draft --verify-tag \
    --title "Modules 1 and 2 ${CIRCLE_TAG#legacy-v}" \
    --notes "Windows executables for Modules 1 and 2, built from ${CIRCLE_SHA1}.

- Module 1: \`LabView_module_1.exe\`
- Module 2: \`LabView_module_2.exe\`

Download the file and run it. There is nothing to install. The executables are not code signed, so Windows SmartScreen warns before the first launch."
else
  cat "$err" >&2
  exit 1
fi

echo "Publishing $CIRCLE_TAG."
gh release edit "$CIRCLE_TAG" --draft=false --prerelease="$prerelease"
gh release view "$CIRCLE_TAG" --json url,isPrerelease,assets \
  --jq '"\(.url) prerelease=\(.isPrerelease)", (.assets[] | "  \(.name)")'

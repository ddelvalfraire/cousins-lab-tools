#!/usr/bin/env bash
# Publishes the installers in installers/*/ as the GitHub release for
# $CIRCLE_TAG.
#
# Releases are immutable once published, so the release starts as a draft,
# gets all of its files, and is then published. A rerun finishes a draft that
# an earlier run left behind and stops without changes if the release is
# already published.
#
# gh reads GITHUB_TOKEN from the environment. Do not use `set -x` here.
set -euo pipefail

: "${GITHUB_TOKEN:?Add the github-releases context to this job.}"
: "${CIRCLE_TAG:?Run this script from a tag pipeline.}"
: "${CIRCLE_SHA1:?Run this script from a tag pipeline.}"
export GH_REPO=ddelvalfraire/cousins-lab-tools
tag=$CIRCLE_TAG

prerelease=false
if [[ $tag =~ -rc\.[0-9]+$ ]]; then
  prerelease=true
fi

shopt -s nullglob
files=(installers/*/*)
if ((${#files[@]} == 0)); then
  echo "No installers in installers/." >&2
  exit 1
fi

# gh release view also finds a draft by the tag it will create.
view_error=$(mktemp)
if is_draft=$(gh release view "$tag" --json isDraft --jq .isDraft 2> "$view_error"); then
  if [[ $is_draft != true ]]; then
    echo "${tag} is already released; tag a new version." >&2
    exit 1
  fi
  echo "Replacing the files of the unpublished draft for ${tag}."
  gh release view "$tag" --json assets --jq '.assets[].name' |
    while IFS= read -r name; do
      gh release delete-asset "$tag" "$name" --yes
    done
elif grep -q 'release not found' "$view_error"; then
  echo "Creating a draft release for ${tag}."
  gh release create "$tag" --draft --verify-tag \
    --prerelease="$prerelease" \
    --title "Desktop app ${tag#desktop-v}" \
    --notes "Installers for the DV-Dash desktop app, built from ${CIRCLE_SHA1}.

- Windows: \`*-setup.exe\` (per-user install) or \`*.msi\`.
- macOS: \`*.dmg\`, for Apple Silicon and Intel Macs.

The installers are not code signed, so Windows SmartScreen and macOS Gatekeeper warn before the first launch."
else
  cat "$view_error" >&2
  exit 1
fi

gh release upload "$tag" "${files[@]}"
gh release edit "$tag" --draft=false --prerelease="$prerelease"

gh api "repos/${GH_REPO}/releases/tags/${tag}" \
  --jq '"\(.html_url) prerelease=\(.prerelease) immutable=\(.immutable)", (.assets[] | "  \(.name)")'

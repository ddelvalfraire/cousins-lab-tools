#!/usr/bin/env bash
# Tests desktop-release-publish.sh against a fake gh that keeps the release in
# a temporary directory. Run it from anywhere:
#   .circleci/scripts/test-desktop-release-publish.sh
set -euo pipefail

script="$(cd "$(dirname "$0")" && pwd)/desktop-release-publish.sh"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/bin"

# The fake release lives in $FAKE_GH: state (draft or published), prerelease,
# and one file per asset in assets/. Every call is appended to calls.
cat > "$work/bin/gh" <<'FAKE'
#!/usr/bin/env bash
set -euo pipefail
echo "gh $*" >> "$FAKE_GH/calls"
state=$(cat "$FAKE_GH/state" 2> /dev/null || true)
case "$1 $2" in
  "release view")
    if [[ -z $state ]]; then echo "release not found" >&2; exit 1; fi
    case "$5" in
      isDraft) [[ $state == draft ]] && echo true || echo false ;;
      assets) ls "$FAKE_GH/assets" ;;
    esac ;;
  "release create")
    [[ " $* " == *" --draft "* ]] || { echo "fake gh: create without --draft" >&2; exit 1; }
    echo draft > "$FAKE_GH/state"
    mkdir -p "$FAKE_GH/assets" ;;
  "release delete-asset")
    [[ $state == draft ]] || { echo "fake gh: release is immutable" >&2; exit 1; }
    rm "$FAKE_GH/assets/$4" ;;
  "release upload")
    [[ $state == draft ]] || { echo "fake gh: release is immutable" >&2; exit 1; }
    for f in "${@:4}"; do
      name=$(basename "$f")
      [[ ! -e $FAKE_GH/assets/$name ]] || { echo "fake gh: $name exists" >&2; exit 1; }
      cp "$f" "$FAKE_GH/assets/$name"
    done ;;
  "release edit")
    for arg in "$@"; do
      case "$arg" in
        --draft=false) echo published > "$FAKE_GH/state" ;;
        --prerelease=*) echo "${arg#--prerelease=}" > "$FAKE_GH/prerelease" ;;
      esac
    done ;;
  "api repos/"*) echo "https://example.test/$CIRCLE_TAG" ;;
  *) echo "fake gh: unexpected call: $*" >&2; exit 1 ;;
esac
FAKE
chmod +x "$work/bin/gh"

failures=0
fail() {
  echo "FAIL ($1): $2"
  failures=$((failures + 1))
}

# Usage: run_case NAME TAG INITIAL_STATE. INITIAL_STATE is none, draft, or
# published. Sets $status and $output.
run_case() {
  local name=$1 tag=$2 initial=$3
  export FAKE_GH="$work/$name/gh"
  mkdir -p "$FAKE_GH/assets" "$work/$name/installers/windows" "$work/$name/installers/macos"
  echo new > "$work/$name/installers/windows/DV-Dash_0.1.0_x64-setup.exe"
  echo new > "$work/$name/installers/windows/DV-Dash_0.1.0_x64_en-US.msi"
  echo new > "$work/$name/installers/macos/DV-Dash_0.1.0_universal.dmg"
  if [[ $initial != none ]]; then
    echo "$initial" > "$FAKE_GH/state"
    echo old > "$FAKE_GH/assets/DV-Dash_0.1.0_x64-setup.exe"
    echo old > "$FAKE_GH/assets/stale-from-earlier-run.txt"
  fi
  set +e
  output=$(cd "$work/$name" &&
    PATH="$work/bin:$PATH" GITHUB_TOKEN=secret-token-value CIRCLE_TAG=$tag CIRCLE_SHA1=abc123 \
      "$script" 2>&1)
  status=$?
  set -e
  if [[ $output == *secret-token-value* ]]; then
    fail "$name" "the output contains the token"
  fi
}

expect_published() {
  local name=$1 prerelease=$2
  [[ $status == 0 ]] || fail "$name" "exit status $status: $output"
  [[ $(cat "$FAKE_GH/state") == published ]] || fail "$name" "release is not published"
  [[ $(cat "$FAKE_GH/prerelease") == "$prerelease" ]] || fail "$name" "prerelease is not $prerelease"
  local assets
  assets=$(cd "$FAKE_GH/assets" && printf '%s ' *)
  [[ $assets == "DV-Dash_0.1.0_universal.dmg DV-Dash_0.1.0_x64-setup.exe DV-Dash_0.1.0_x64_en-US.msi " ]] ||
    fail "$name" "unexpected assets: $assets"
  grep -qx new "$FAKE_GH/assets/DV-Dash_0.1.0_x64-setup.exe" || fail "$name" "setup.exe was not replaced"
}

run_case no-release desktop-v0.1.0-rc.2 none
expect_published no-release true
grep -q -- '--draft --verify-tag' "$FAKE_GH/calls" || fail no-release "release was not created as a draft"

run_case final-release desktop-v0.1.0 none
expect_published final-release false

run_case existing-draft desktop-v0.1.0-rc.2 draft
expect_published existing-draft true
grep -q 'release create' "$FAKE_GH/calls" && fail existing-draft "created a second release"

run_case already-published desktop-v0.1.0-rc.2 published
[[ $status != 0 ]] || fail already-published "exit status 0"
[[ $output == *"desktop-v0.1.0-rc.2 is already released; tag a new version."* ]] ||
  fail already-published "missing error message: $output"
[[ $(grep -vc '^gh release view ' "$FAKE_GH/calls") == 0 ]] ||
  fail already-published "made changes: $(cat "$FAKE_GH/calls")"
[[ $(cat "$FAKE_GH/assets/DV-Dash_0.1.0_x64-setup.exe") == old ]] || fail already-published "assets changed"

if ((failures > 0)); then
  echo "$failures failed."
  exit 1
fi
echo "All cases passed."

#!/usr/bin/env bash
# Run publish-legacy-release.sh against a fake gh, one case per release state:
#   bash .circleci/scripts/test-publish-legacy-release.sh
set -euo pipefail

script="$(cd "$(dirname "$0")" && pwd)/publish-legacy-release.sh"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# The fake gh keeps the release state (none, draft or published) in a file,
# appends each call to calls.log, and refuses changes that GitHub refuses on
# an immutable published release.
mkdir "$work/bin"
cat > "$work/bin/gh" << 'EOF'
#!/usr/bin/env bash
echo "gh $*" >> "$FAKE/calls.log"
state=$(< "$FAKE/state")
case "$1 $2" in
  "release view")
    if [[ $state == none ]]; then echo "release not found" >&2; exit 1; fi
    if [[ $state == error ]]; then echo "HTTP 401: Bad credentials" >&2; exit 1; fi
    if [[ $* == *isDraft* ]]; then
      [[ $state == draft ]] && echo true || echo false
    else
      echo "https://example.test/release prerelease=?"
    fi ;;
  "release create")
    [[ $state == none && $* == *--draft* ]] || exit 1
    echo draft > "$FAKE/state" ;;
  "release upload")
    [[ $state == draft ]] || { echo "HTTP 422: Cannot upload assets to an immutable release." >&2; exit 1; } ;;
  "release edit")
    [[ $state == draft ]] || exit 1
    [[ $* == *--draft=false* ]] && echo published > "$FAKE/state" ;;
  *) echo "unexpected call: gh $*" >&2; exit 1 ;;
esac
EOF
chmod +x "$work/bin/gh"
mkdir "$work/dist"
touch "$work/dist/LabView_module_1.exe" "$work/dist/LabView_module_2.exe"

failures=0
fail() { echo "FAIL ($1): $2"; failures=$((failures + 1)); }

# run <case> <starting state> <tag>: run the script and keep its exit code.
run() {
  export FAKE="$work/$1"
  mkdir "$FAKE"
  echo "$2" > "$FAKE/state"
  : > "$FAKE/calls.log"
  set +e
  PATH="$work/bin:$PATH" CIRCLE_TAG=$3 CIRCLE_SHA1=abc123 \
    GITHUB_TOKEN=secret-token-value bash "$script" "$work/dist" > "$FAKE/out" 2>&1
  code=$?
  set -e
  if grep -q secret-token-value "$FAKE/out" "$FAKE/calls.log"; then
    fail "$1" "the token was printed"
  fi
}

expect() { # expect <case> <description> <command...>
  local name=$1 what=$2
  shift 2
  "$@" || fail "$name" "$what"
}

run new none legacy-v0.2.0-rc.2
expect new "exits 0" test "$code" -eq 0
expect new "creates a draft with both files" \
  grep -q "release create legacy-v0.2.0-rc.2 $work/dist/LabView_module_1.exe $work/dist/LabView_module_2.exe --draft" "$FAKE/calls.log"
expect new "publishes as a pre-release" grep -q "release edit legacy-v0.2.0-rc.2 --draft=false --prerelease=true" "$FAKE/calls.log"
expect new "ends published" grep -qx published "$FAKE/state"

run draft draft legacy-v0.2.0
expect draft "exits 0" test "$code" -eq 0
expect draft "replaces the files" grep -q "release upload legacy-v0.2.0 .* --clobber" "$FAKE/calls.log"
expect draft "creates nothing" bash -c "! grep -q 'release create' '$FAKE/calls.log'"
expect draft "publishes as a full release" grep -q "release edit legacy-v0.2.0 --draft=false --prerelease=false" "$FAKE/calls.log"
expect draft "ends published" grep -qx published "$FAKE/state"

run published published legacy-v0.2.0
expect published "exits non-zero" test "$code" -ne 0
expect published "says to tag a new version" grep -qx "legacy-v0.2.0 is already released; tag a new version." "$FAKE/out"
expect published "only looks up the release" test "$(wc -l < "$FAKE/calls.log")" -eq 1

run lookup-error error legacy-v0.2.0
expect lookup-error "exits non-zero" test "$code" -ne 0
expect lookup-error "shows the gh error" grep -q "HTTP 401" "$FAKE/out"
expect lookup-error "only looks up the release" test "$(wc -l < "$FAKE/calls.log")" -eq 1

if ((failures)); then
  echo "$failures check(s) failed."
  exit 1
fi
echo "All checks passed."

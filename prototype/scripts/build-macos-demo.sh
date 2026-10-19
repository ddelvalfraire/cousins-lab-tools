#!/bin/bash
set -euo pipefail

if [[ "$(uname -s)" != Darwin ]]; then
    echo "Build this package on the Mac that will run the demo." >&2
    exit 1
fi

repo=$(cd "$(dirname "$0")/../.." && pwd)
destination=${1:-"$HOME/Downloads/Cousins Lab Demo"}
mkdir -p "$destination"
destination=$(cd "$destination" && pwd)
export PATH="$HOME/.cargo/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
xcode-select -p >/dev/null
cd "$repo/prototype"
cargo build --locked --release -p cousinslab-desktop --features custom-protocol

stage=$(mktemp -d "$destination/.build.XXXXXX")
trap 'rm -rf "$stage"' EXIT
app="$stage/Cousins Lab Acquisition.app"
resources="$app/Contents/Resources"
assets="$resources/demo-resources"
mkdir -p "$app/Contents/MacOS" "$assets/prototype/core" "$assets/module2" "$assets/reference"
cp "${CARGO_TARGET_DIR:-target}/release/cousinslab-desktop" "$app/Contents/MacOS/cousinslab-desktop"
cp -R core/templates core/instruments "$assets/prototype/core/"
cp -R "$repo/reference/instruments" "$assets/reference/"
cp "$repo/module2/SampleData.zip" "$assets/module2/"
cat > "$app/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>Cousins Lab Acquisition</string>
<key>CFBundleDisplayName</key><string>Cousins Lab Acquisition</string>
<key>CFBundleIdentifier</key><string>edu.wsu.cousinslab.acquisition</string>
<key>CFBundleExecutable</key><string>cousinslab-desktop</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>0.1.0</string>
<key>CFBundleVersion</key><string>1</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
plutil -lint "$app/Contents/Info.plist"
codesign --force --deep --sign - "$app"
codesign --verify --deep --strict "$app"

# Keep previous builds until the replacement is complete.
if [[ -e "$destination/Cousins Lab Acquisition.app" ]]; then
    mv "$destination/Cousins Lab Acquisition.app" "$destination/Cousins Lab Acquisition.previous-$(date +%Y%m%d-%H%M%S).app"
fi
mv "$app" "$destination/"
cp "$repo/prototype/docs/MAC-DEMO.md" "$destination/START HERE.md"
cp "$repo/prototype/README.md" "$destination/Full prototype guide.md"
mkdir -p "$destination/Sample recordings"
cp "$repo/reference/instruments/mass-spec/Raw data-mass spec.xlsx" "$destination/Sample recordings/"
cp "$repo/reference/instruments/ambit/"*.csv "$destination/Sample recordings/"
cp "$repo/module2/SampleData.zip" "$destination/Sample recordings/"
cat > "$destination/Start demo.command" <<'LAUNCH'
#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
open "Cousins Lab Acquisition.app"
LAUNCH
chmod +x "$destination/Start demo.command"
{
    git -C "$repo" log -1 --format='Commit: %H%nSubject: %s'
    git -C "$repo" status --short
    sw_vers
    uname -m
    rustc --version
    date -u '+Built: %Y-%m-%d %H:%M:%S UTC'
    shasum -a 256 "$destination/Cousins Lab Acquisition.app/Contents/MacOS/cousinslab-desktop"
} > "$destination/Build information.txt"
echo "Demo package: $destination"
echo "Double-click Cousins Lab Acquisition.app. Read START HERE.md for the walkthrough."

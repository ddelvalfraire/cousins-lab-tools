# DVDash brand assets

The SVG files in this folder are the masters. Every PNG, ICO, and ICNS export comes from them.

<table width="100%">
  <thead>
    <tr><th scope="col" align="left" width="450">File</th><th scope="col" align="left" width="1000">Use</th></tr>
  </thead>
  <tbody>
    <tr><td><code>icon.svg</code></td><td>Full-color app icon. Also usable as a web favicon.</td></tr>
    <tr><td><code>lettering.svg</code></td><td>Wordmark as outlines, with no font dependency</td></tr>
    <tr><td><code>lockup-light.svg</code>, <code>lockup-dark.svg</code></td><td>Icon and wordmark for light and dark surfaces</td></tr>
    <tr><td><code>mark-mono.svg</code>, <code>mark-inverse.svg</code></td><td>Single-color mark variants</td></tr>
    <tr><td><code>png/</code></td><td>Transparent 16, 24, 32, 48, 64, 128, 256, 512, and 1024 px exports</td></tr>
    <tr><td><code>../../../apps/desktop/src-tauri/icons/</code></td><td>Windows ICO, macOS ICNS, and Tauri PNG and store resources</td></tr>
  </tbody>
</table>

## Construction

- The icon is a 170 × 170 square with a 36-unit corner radius. Its artwork fills the canvas edge to edge, with no padding.
- The wordmark is Lexend ExtraBold (weight 800) converted to outlines. Lexend is licensed under the SIL Open Font License 1.1.
- The lockups place the icon at 128 units tall with a 37-unit gap before the wordmark.

<table width="100%">
  <thead>
    <tr><th scope="col" align="left" width="450">Color</th><th scope="col" align="left" width="1000">Use</th></tr>
  </thead>
  <tbody>
    <tr><td><code>#064637</code></td><td>Icon background</td></tr>
    <tr><td><code>#BAF2B9</code>, <code>#9DEFBA</code></td><td>Icon light bands</td></tr>
    <tr><td><code>#07AE8A</code>, <code>#026C54</code></td><td>Icon middle and dark bands</td></tr>
    <tr><td><code>#063d30</code></td><td>Wordmark on light surfaces, and the mono mark</td></tr>
    <tr><td><code>#f7f8f2</code></td><td>Wordmark on dark surfaces</td></tr>
  </tbody>
</table>

## Regenerate the exports

Edit `icon.svg` or `lettering.svg`, then run this from the repository root after installing the desktop dependencies:

```sh
python3 assets/branding/dvdash/generate.py
```

The script rebuilds the lockups, the mono marks, the PNG exports, and the desktop app icons. Set `TAURI_CLI` to an existing Tauri CLI executable if the desktop dependencies are installed elsewhere.

The social preview in `../../readme/social-preview.png` is not generated. Update it by hand when the lockup changes.

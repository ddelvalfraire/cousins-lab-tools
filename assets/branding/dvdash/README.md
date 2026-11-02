# DVDash brand assets

The SVG masters reproduce the selected GREEN FIELD concept. The symbol and lettering were vectorized from that artwork; these are proposed assets for review.

<table width="100%">
  <thead>
    <tr><th scope="col" align="left" width="450">File</th><th scope="col" align="left" width="1000">Use</th></tr>
  </thead>
  <tbody>
    <tr><td><code>icon.svg</code></td><td>Editable full-color app icon; also usable as a web favicon</td></tr>
    <tr><td><code>lettering.svg</code></td><td>Editable wordmark letterforms, with no font dependency</td></tr>
    <tr><td><code>lockup-light.svg</code>, <code>lockup-dark.svg</code></td><td>Icon and wordmark on light/dark surfaces</td></tr>
    <tr><td><code>mark-mono.svg</code>, <code>mark-inverse.svg</code></td><td>Single-color mark variants</td></tr>
    <tr><td><code>png/</code></td><td>Transparent 16, 24, 32, 48, 64, 128, 256, 512, and 1024 px exports</td></tr>
    <tr><td><code>../../../apps/desktop/src-tauri/icons/</code></td><td>Windows ICO, macOS ICNS, and Tauri PNG/store resources</td></tr>
  </tbody>
</table>

From the repository root, after installing the desktop dependencies:

```sh
python3 assets/branding/dvdash/generate.py
```

Set `TAURI_CLI` to an existing Tauri CLI executable if desktop dependencies are installed elsewhere. The SVG masters are the source for exports; the original concept board is not needed for regeneration.

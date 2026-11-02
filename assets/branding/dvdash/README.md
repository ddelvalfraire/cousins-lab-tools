# DVDash brand assets

The SVG masters reproduce the selected GREEN FIELD concept. The symbol and lettering were vectorized from that artwork; these are proposed assets for review.

| File | Use |
| --- | --- |
| `icon.svg` | Editable full-color app icon; also usable as a web favicon |
| `lettering.svg` | Editable wordmark letterforms, with no font dependency |
| `lockup-light.svg`, `lockup-dark.svg` | Icon and wordmark on light/dark surfaces |
| `mark-mono.svg`, `mark-inverse.svg` | Single-color mark variants |
| `png/` | Transparent 16, 24, 32, 48, 64, 128, 256, 512, and 1024 px exports |
| `../../../apps/desktop/src-tauri/icons/` | Windows ICO, macOS ICNS, and Tauri PNG/store resources |

From the repository root, after installing the desktop dependencies:

```sh
python3 assets/branding/dvdash/generate.py
```

Set `TAURI_CLI` to an existing Tauri CLI executable if desktop dependencies are installed elsewhere. The SVG masters are the source for exports; the original concept board is not needed for regeneration.

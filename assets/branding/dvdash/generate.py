#!/usr/bin/env python3
"""Regenerate proposed DVDash assets from the editable SVG masters."""
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
import xml.etree.ElementTree as ET

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", NS)
SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024]

def svg(width, height, body):
    return f'<svg xmlns="{NS}" width="{width}" height="{height}" viewBox="0 0 {width} {height}">{body}</svg>'

def contents(path, color=None):
    root = ET.parse(path).getroot()
    if color:
        for node in root.iter():
            if "fill" in node.attrib:
                node.set("fill", color)
    return "".join(ET.tostring(child, encoding="unicode") for child in root)

def variants():
    icon = contents(HERE / "icon.svg")
    for variant, color in [("light", "#063d30"), ("dark", "#f7f8f2")]:
        letters = contents(HERE / "lettering.svg", color)
        body = f'<g transform="scale(0.753)">{icon}</g><g transform="translate(156 12)">{letters}</g>'
        (HERE / f"lockup-{variant}.svg").write_text(svg(660, 128, body))
    original = ET.parse(HERE / "icon.svg").getroot()
    for node in original.iter():
        value = node.get("fill", "")
        if value.startswith("#") and len(value) == 7:
            red, green, blue = [int(value[i:i+2], 16) for i in [1, 3, 5]]
            node.set("fill", "white" if .2126*red + .7152*green + .0722*blue > 130 else "black")
    mask = "".join(ET.tostring(child, encoding="unicode") for child in original)
    for name, color in [("mono", "#063d30"), ("inverse", "#ffffff")]:
        (HERE / f"mark-{name}.svg").write_text(svg(170, 170,
            f'<defs><mask id="mark" maskUnits="userSpaceOnUse" x="0" y="0" width="170" height="170">{mask}</mask></defs>'
            f'<rect width="170" height="170" fill="{color}" mask="url(#mark)"/>'))

def normalize_icns(path):
    # Tauri emits equivalent ICNS layers in varying order.
    data = path.read_bytes()
    if data[:4] != b"icns" or int.from_bytes(data[4:8], "big") != len(data):
        raise ValueError("Invalid ICNS header")
    chunks, offset = [], 8
    while offset < len(data):
        length = int.from_bytes(data[offset+4:offset+8], "big")
        if length < 8 or offset + length > len(data):
            raise ValueError("Invalid ICNS layer")
        chunks.append(data[offset:offset+length])
        offset += length
    body = b"".join(sorted(chunks))
    path.write_bytes(b"icns" + (8 + len(body)).to_bytes(4, "big") + body)

def main():
    variants()
    cli = os.environ.get("TAURI_CLI") or str(ROOT / "apps/desktop/node_modules/.bin/tauri")
    if not Path(cli).exists():
        raise SystemExit("Install desktop dependencies or set TAURI_CLI to the existing Tauri CLI.")
    destination = ROOT / "apps/desktop/src-tauri/icons"
    with tempfile.TemporaryDirectory() as temporary:
        subprocess.run([cli, "icon", str(HERE / "icon.svg"), "--output", temporary], cwd=ROOT, check=True)
        for path in Path(temporary).iterdir():
            if path.is_file():
                shutil.copyfile(path, destination / path.name)
    normalize_icns(destination / "icon.icns")
    png = HERE / "png"
    png.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as temporary:
        command = [cli, "icon", str(HERE / "icon.svg"), "--output", temporary]
        for size in SIZES:
            command.extend(["--png", str(size)])
        subprocess.run(command, cwd=ROOT, check=True)
        for size in SIZES:
            name = f"{size}x{size}.png"
            shutil.copyfile(Path(temporary) / name, png / name)
    shutil.copyfile(png / "128x128.png", ROOT / "design/readme-review/assets/icon.png")
    print("Generated SVG variants, PNG size exports, and native app icons.")

if __name__ == "__main__":
    main()

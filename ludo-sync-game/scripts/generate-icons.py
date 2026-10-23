#!/usr/bin/env python3
"""
Builds every Ludo Sync app icon from one parametric design.

The mark is the Ludo board seen from above: four colour triangles meeting at the centre
(red bottom, green left, blue top, purple right, matching the in-game seats), a token
guarding each home, and a die resting on the middle.

Variants
  any        rounded tile with transparent corners        -> PWA "any", icon.svg sources
  maskable   full-bleed square, artwork inside the 80% safe circle -> PWA "maskable"
  apple      full-bleed square, bigger artwork            -> apple-icon.png (iOS rounds it itself)
  favicon    simplified (no tokens / shadows) for small sizes -> favicon.ico 32/48, icon.svg
  tiny       one-pip cut of the favicon for the 16px frame

Run from the app folder:  python3 scripts/generate-icons.py
Needs Chromium (set CHROME to override the path) to rasterise the SVG, nothing else.
"""
from __future__ import annotations

import os
import shutil
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

APP = Path(__file__).resolve().parent.parent
PUBLIC_ICONS = APP / "public" / "icons"
DESIGN = APP / "design" / "icons"
APP_DIR = APP / "src" / "app"

CHROME_CANDIDATES = [
    os.environ.get("CHROME", ""),
    "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell",
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    shutil.which("chromium") or "",
    shutil.which("chromium-browser") or "",
    shutil.which("google-chrome") or "",
]

# name: (light, main, dark), matched to the in-game Chakra 500 colours
SEATS = {
    "top": ("blue", "#63B3ED", "#3182CE", "#2A4E8F"),
    "right": ("purple", "#B794F4", "#805AD5", "#4F3490"),
    "bottom": ("red", "#FC8181", "#E53E3E", "#9B2C2C"),
    "left": ("green", "#68D391", "#38A169", "#22603F"),
}

BG_TOP = "#2B3A6B"
BG_BOTTOM = "#090E21"
PIP = "#18203A"


def svg(kind: str) -> str:
    full_bleed = kind in ("maskable", "apple")
    simple = kind in ("favicon", "tiny")
    board = {"any": 700, "maskable": 590, "apple": 640, "favicon": 900, "tiny": 920}[kind]
    c = 512
    h = board / 2
    x0, x1 = c - h, c + h
    brx = board * (0.157 if not simple else 0.15)

    die = board * (0.43 if not simple else 0.5)
    if kind == "tiny":
        die = board * 0.56
    die_rx = die * 0.24
    die_tilt = -10 if not simple else -8
    pip_off = die * 0.26
    pip_r = die * (0.092 if not simple else 0.125)
    if kind == "tiny":
        pip_r = die * 0.2

    tok_d = h * 0.71
    tok_r = board * 0.066
    div_w = board * (0.018 if not simple else 0.03)
    out_w = board * (0.026 if not simple else 0.04)

    corners = {"tl": (x0, x0), "tr": (x1, x0), "br": (x1, x1), "bl": (x0, x1)}
    tri = {
        "top": [corners["tl"], corners["tr"], (c, c)],
        "right": [corners["tr"], corners["br"], (c, c)],
        "bottom": [corners["br"], corners["bl"], (c, c)],
        "left": [corners["bl"], corners["tl"], (c, c)],
    }
    edge_mid = {"top": (c, x0), "right": (x1, c), "bottom": (c, x1), "left": (x0, c)}
    tok_pos = {
        "top": (c, c - tok_d), "right": (c + tok_d, c),
        "bottom": (c, c + tok_d), "left": (c - tok_d, c),
    }

    defs = [
        f'<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{BG_TOP}"/>'
        f'<stop offset="1" stop-color="{BG_BOTTOM}"/></linearGradient>',
        '<radialGradient id="glow" cx="0.5" cy="0.42" r="0.6"><stop offset="0" stop-color="#fff" stop-opacity="0.20"/>'
        '<stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>',
        f'<clipPath id="board"><rect x="{x0}" y="{x0}" width="{board}" height="{board}" rx="{brx}"/></clipPath>',
        '<linearGradient id="dieFace" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="#FFFFFF"/>'
        '<stop offset="1" stop-color="#DCE3F5"/></linearGradient>',
    ]
    if not simple:
        defs.append(
            '<filter id="drop" x="-30%" y="-30%" width="160%" height="170%">'
            '<feDropShadow dx="0" dy="22" stdDeviation="20" flood-color="#02050F" flood-opacity="0.55"/></filter>'
        )
        defs.append(
            '<filter id="soft" x="-30%" y="-30%" width="160%" height="170%">'
            '<feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#02050F" flood-opacity="0.45"/></filter>'
        )

    body: list[str] = []

    # tile
    if full_bleed:
        body.append('<rect width="1024" height="1024" fill="url(#bg)"/>')
        body.append('<rect width="1024" height="1024" fill="url(#glow)"/>')
    else:
        bg_rx = 230 if not simple else 200
        body.append(f'<rect width="1024" height="1024" rx="{bg_rx}" fill="url(#bg)"/>')
        body.append(f'<rect width="1024" height="1024" rx="{bg_rx}" fill="url(#glow)"/>')
        body.append(
            f'<rect x="6" y="6" width="1012" height="1012" rx="{bg_rx - 6}" fill="none" '
            'stroke="#fff" stroke-opacity="0.14" stroke-width="6"/>'
        )

    # board: shadow plate, triangles, dividers, outline
    if not simple:
        body.append(
            f'<rect x="{x0}" y="{x0}" width="{board}" height="{board}" rx="{brx}" fill="#0B1228" filter="url(#drop)"/>'
        )
    tri_svg = []
    for side, pts in tri.items():
        _, light, main, dark = SEATS[side]
        gid = f"g-{side}"
        ex, ey = edge_mid[side]
        defs.append(
            f'<linearGradient id="{gid}" gradientUnits="userSpaceOnUse" x1="{ex}" y1="{ey}" x2="{c}" y2="{c}">'
            f'<stop offset="0" stop-color="{light}"/><stop offset="0.55" stop-color="{main}"/>'
            f'<stop offset="1" stop-color="{dark}"/></linearGradient>'
        )
        p = " ".join(f"{x:.1f},{y:.1f}" for x, y in pts)
        tri_svg.append(f'<polygon points="{p}" fill="url(#{gid})"/>')
    body.append('<g clip-path="url(#board)">' + "".join(tri_svg))
    body.append(
        f'<path d="M{x0} {x0} L{x1} {x1} M{x1} {x0} L{x0} {x1}" stroke="#fff" stroke-opacity="0.96" '
        f'stroke-width="{div_w:.1f}" stroke-linecap="round"/></g>'
    )
    body.append(
        f'<rect x="{x0}" y="{x0}" width="{board}" height="{board}" rx="{brx}" fill="none" '
        f'stroke="#fff" stroke-opacity="0.96" stroke-width="{out_w:.1f}"/>'
    )

    # tokens
    if not simple:
        for side, (tx, ty) in tok_pos.items():
            _, light, main, dark = SEATS[side]
            rid = f"t-{side}"
            defs.append(
                f'<radialGradient id="{rid}" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="{light}"/>'
                f'<stop offset="0.5" stop-color="{main}"/><stop offset="1" stop-color="{dark}"/></radialGradient>'
            )
            body.append(
                f'<g filter="url(#soft)"><circle cx="{tx:.1f}" cy="{ty:.1f}" r="{tok_r:.1f}" fill="url(#{rid})" '
                f'stroke="#fff" stroke-width="{board * 0.016:.1f}"/>'
                f'<circle cx="{tx - tok_r * 0.32:.1f}" cy="{ty - tok_r * 0.36:.1f}" r="{tok_r * 0.2:.1f}" '
                'fill="#fff" fill-opacity="0.75"/></g>'
            )

    # die
    pips = [(0, 0)] if kind == "tiny" else [(-1, -1), (1, -1), (0, 0), (-1, 1), (1, 1)]
    pip_svg = "".join(
        f'<circle cx="{px * pip_off:.1f}" cy="{py * pip_off:.1f}" r="{pip_r:.1f}" fill="{PIP}"/>' for px, py in pips
    )
    filt = ' filter="url(#drop)"' if not simple else ""
    body.append(
        f'<g transform="translate({c} {c}) rotate({die_tilt})"{filt}>'
        f'<rect x="{-die / 2:.1f}" y="{-die / 2:.1f}" width="{die:.1f}" height="{die:.1f}" rx="{die_rx:.1f}" fill="url(#dieFace)"/>'
        f'<rect x="{-die / 2 + 6:.1f}" y="{-die / 2 + 6:.1f}" width="{die - 12:.1f}" height="{die - 12:.1f}" '
        f'rx="{die_rx - 6:.1f}" fill="none" stroke="#fff" stroke-opacity="0.9" stroke-width="5"/>'
        f"{pip_svg}</g>"
    )

    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">'
        f'<defs>{"".join(defs)}</defs>{"".join(body)}</svg>\n'
    )


def find_chrome() -> str:
    for cand in CHROME_CANDIDATES:
        if cand and Path(cand).exists():
            return cand
    sys.exit("No Chromium found. Set CHROME=/path/to/chrome and retry.")


def render(chrome: str, svg_text: str, size: int, out: Path, transparent: bool) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        html = Path(tmp) / "icon.html"
        html.write_text(
            '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent;overflow:hidden}'
            f"svg{{display:block;width:{size}px;height:{size}px}}</style>{svg_text}"
        )
        out.parent.mkdir(parents=True, exist_ok=True)
        cmd = [
            chrome, "--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
            "--force-device-scale-factor=1", f"--window-size={size},{size}",
            f"--default-background-color={'00000000' if transparent else 'FFFFFFFF'}",
            f"--screenshot={out}", f"file://{html}",
        ]
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120)
    if not out.exists() or out.stat().st_size == 0:
        sys.exit(f"Chromium produced no output for {out}")


def write_ico(pngs: list[tuple[int, Path]], out: Path) -> None:
    """A .ico that embeds PNG frames (valid since Windows Vista and every browser)."""
    frames = [(s, p.read_bytes()) for s, p in pngs]
    header = struct.pack("<HHH", 0, 1, len(frames))
    offset = 6 + 16 * len(frames)
    entries, blobs = b"", b""
    for size, data in frames:
        entries += struct.pack("<BBBBHHII", size % 256, size % 256, 0, 0, 1, 32, len(data), offset)
        blobs += data
        offset += len(data)
    out.write_bytes(header + entries + blobs)


def main() -> None:
    chrome = find_chrome()
    DESIGN.mkdir(parents=True, exist_ok=True)

    sources = {k: svg(k) for k in ("any", "maskable", "apple", "favicon", "tiny")}
    for name, text in sources.items():
        (DESIGN / f"ludo-sync-{name}.svg").write_text(text)
    (APP_DIR / "icon.svg").write_text(sources["favicon"])

    # PWA icons
    if PUBLIC_ICONS.exists():
        shutil.rmtree(PUBLIC_ICONS)
    for size in (192, 512):
        render(chrome, sources["any"], size, PUBLIC_ICONS / f"icon-{size}x{size}.png", True)
        render(chrome, sources["maskable"], size, PUBLIC_ICONS / f"icon-maskable-{size}x{size}.png", False)
    render(chrome, sources["any"], 1024, DESIGN / "ludo-sync-icon-1024.png", True)

    # iOS home screen
    render(chrome, sources["apple"], 180, APP_DIR / "apple-icon.png", False)

    # favicon.ico (16/32/48, each rendered natively rather than shrunk)
    with tempfile.TemporaryDirectory() as tmp:
        frames = []
        for size in (16, 32, 48):
            p = Path(tmp) / f"f{size}.png"
            # 16px gets the one-pip cut; five pips turn to mush at that size
            render(chrome, sources["tiny" if size == 16 else "favicon"], size, p, True)
            frames.append((size, p))
        write_ico(frames, APP_DIR / "favicon.ico")

    print("icons written")


if __name__ == "__main__":
    main()

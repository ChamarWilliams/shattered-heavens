"""Draw the dungeon trap sheets procedurally (pixel art, no image model).

Writes public/assets/traps/ (frames laid out in one row, 16px art scaled 2x):
  spikes.png   6 frames 32x32  retracted, warning, rising, up, up, sinking
  firevent.png 8 frames 32x48  grate, warning glow, flame bursts x4, dying x2
  pitfall.png  7 frames 32x32  cracked slab, cracks spread, crumbling x2, falling, open pit x2
Frame counts must match src/game/TrapSystem.ts.

Run:  python tools/generate_trap_sprites.py   (needs numpy, Pillow)
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image

import importlib.util

ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location("items", ROOT / "tools" / "generate_item_sprites.py")
_items = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_items)
Canvas = _items.Canvas

STONE, STONE_DARK, STONE_LIGHT = "#4a4f55", "#2c3036", "#6a7078"


def slab(c: "Canvas", top: int = 0) -> None:
    c.rect(1, top + 1, 14, top + 14, STONE); c.rect(1, top + 1, 14, top + 1, STONE_LIGHT); c.rect(1, top + 14, 14, top + 14, STONE_DARK)
    c.rect(1, top + 1, 1, top + 14, STONE_LIGHT); c.rect(14, top + 1, 14, top + 14, STONE_DARK)


def spikes(frame: int) -> Image.Image:
    c = Canvas(16, 16)
    slab(c)
    holes = [(4, 4), (8, 4), (12, 4), (6, 8), (10, 8), (4, 12), (8, 12), (12, 12)]
    height = [0, 1, 3, 5, 5, 2][frame]
    for x, y in holes:
        c.rect(x - 1, y, x, y + 1, "#14161a")
        if frame == 1:
            c.dot(x - 1, y, "#ff6b4a")
        if height:
            for step in range(height):
                c.rect(x - 1, y - step, x, y - step, "#c9d4d8" if step < height - 1 else "#ffffff")
            c.dot(x, y - height + 1, "#8a949a")
    return c.finish()


def firevent(frame: int) -> Image.Image:
    c = Canvas(16, 24)
    slab(c, top=8)
    for x in (4, 7, 10):
        c.rect(x, 12, x + 1, 19, "#14161a")
    if frame == 1:
        for x in (4, 7, 10):
            c.rect(x, 15, x + 1, 17, "#ff7a3c")
    if 2 <= frame <= 5:
        sway = [0, 1, 0, -1][frame - 2]
        height = [10, 15, 16, 14][frame - 2]
        for row in range(height):
            y = 19 - row
            # Wide at the vent, tapering to licking tips.
            width = max(0.5, 5.2 * (1 - row / height) ** 0.75 * (0.85 + 0.15 * math.sin(row * 1.7 + frame)))
            cx = 7.5 + sway * (row / height)
            colour = "#fff1c2" if row < height * 0.3 else "#ffb060" if row < height * 0.65 else "#e0472f"
            c.rect(round(cx - width), y, round(cx + width), y, colour)
            if row < height * 0.3:
                c.rect(round(cx - width / 2), y, round(cx + width / 2), y, "#ffffff")
    if frame >= 6:
        for k, x in enumerate((5, 8, 11)):
            c.dot(x, 11 - (frame - 6) * 2 - k % 2, "#ff9a5a" if frame == 6 else "#7a5a4a")
    return c.finish()


def pitfall(frame: int) -> Image.Image:
    c = Canvas(16, 16)
    if frame <= 3:
        slab(c)
        cracks = [[(4, 5, 8, 8), (8, 8, 11, 6)], [(4, 5, 8, 8), (8, 8, 11, 6), (8, 8, 9, 12), (3, 10, 6, 9)]][min(frame, 1)]
        for x0, y0, x1, y1 in cracks:
            c.line(x0, y0, x1, y1, "#14161a")
        if frame >= 2:
            c.rect(6, 7, 9, 9, "#14161a")
            for x, y in [(2, 3), (12, 12), (13, 3)][: frame - 1]:
                c.rect(x, y, x + 1, y + 1, "#14161a")
    else:
        c.rect(1, 1, 14, 14, "#060608"); c.rect(2, 2, 13, 13, "#000000")
        c.rect(1, 1, 14, 1, STONE_DARK); c.rect(1, 1, 1, 14, STONE_DARK); c.rect(14, 1, 14, 14, STONE_DARK)
        c.rect(1, 2, 14, 3, "#1c1e22")
        if frame == 4:
            for x, y in [(5, 6), (9, 8), (7, 10)]:
                c.rect(x, y, x + 1, y + 1, STONE)
    return c.finish()


def main() -> None:
    destination = ROOT / "public" / "assets" / "traps"
    destination.mkdir(parents=True, exist_ok=True)
    for name, draw, frames, height in (("spikes", spikes, 6, 32), ("firevent", firevent, 8, 48), ("pitfall", pitfall, 7, 32)):
        sheet = Image.new("RGBA", (32 * frames, height))
        for frame in range(frames):
            sheet.alpha_composite(draw(frame), (frame * 32, 0))
        sheet.save(destination / f"{name}.png", optimize=True)
    print("spikes.png, firevent.png, pitfall.png")


if __name__ == "__main__":
    main()

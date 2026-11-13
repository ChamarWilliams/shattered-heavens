"""Draw the loot sprites procedurally (pixel art, no image model).

Writes public/assets/items/:
  items.png   ITEM_CELL x ITEM_CELL icons in one row, in ITEM_ORDER
  chests.png  two rows of CHEST_FRAMES frames (CHEST_W x CHEST_H):
              row 0 the wooden room chest, row 1 the gilded warden chest,
              frame 0 closed, the rest the lid swinging open
Each icon is drawn on a 16x16 grid, outlined in ink and scaled up 2x so every
art pixel is crisp. Order and sizes must match src/domain/runItems.ts.

Run:  python tools/generate_item_sprites.py   (needs numpy, Pillow)
"""

from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
GRID = 16
SCALE = 2
ITEM_CELL = GRID * SCALE
CHEST_W, CHEST_H, CHEST_FRAMES = 24 * SCALE, 22 * SCALE, 5
INK = (27, 20, 16, 255)
ITEM_ORDER = [
    "spirit-peach", "jade-elixir", "qi-crystal", "echo-shard",
    "whetstone-talisman", "crane-feather", "phoenix-ember", "mirror-charm", "spirit-lantern", "thorn-seal",
    "frost-infusion", "storm-infusion", "ember-infusion",
    "art-sectless", "art-nightfold", "art-moonfox", "jade-slip",
]


def hex_rgba(value: str, alpha: int = 255) -> tuple[int, int, int, int]:
    return (int(value[1:3], 16), int(value[3:5], 16), int(value[5:7], 16), alpha)


class Canvas:
    def __init__(self, width: int = GRID, height: int = GRID) -> None:
        self.px = np.zeros((height, width, 4), dtype=np.uint8)
        self.h, self.w = height, width

    def dot(self, x: int, y: int, colour: str) -> None:
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[y, x] = hex_rgba(colour)

    def rect(self, x0: int, y0: int, x1: int, y1: int, colour: str) -> None:
        self.px[max(0, y0):min(self.h, y1 + 1), max(0, x0):min(self.w, x1 + 1)] = hex_rgba(colour)

    def ellipse(self, cx: float, cy: float, rx: float, ry: float, colour: str) -> None:
        yy, xx = np.mgrid[0:self.h, 0:self.w] + 0.5
        self.px[((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1] = hex_rgba(colour)

    def poly(self, points: list[tuple[float, float]], colour: str) -> None:
        yy, xx = np.mgrid[0:self.h, 0:self.w] + 0.5
        inside = np.zeros((self.h, self.w), dtype=bool)
        for i in range(len(points)):
            (x0, y0), (x1, y1) = points[i], points[(i + 1) % len(points)]
            crosses = ((y0 <= yy) & (yy < y1)) | ((y1 <= yy) & (yy < y0))
            with np.errstate(divide="ignore", invalid="ignore"):
                x_at = x0 + (yy - y0) * (x1 - x0) / (y1 - y0)
            inside ^= crosses & (xx < x_at)
        self.px[inside] = hex_rgba(colour)

    def line(self, x0: int, y0: int, x1: int, y1: int, colour: str) -> None:
        steps = max(abs(x1 - x0), abs(y1 - y0), 1)
        for i in range(steps + 1):
            self.dot(round(x0 + (x1 - x0) * i / steps), round(y0 + (y1 - y0) * i / steps), colour)

    def finish(self, scale: int = SCALE) -> Image.Image:
        """Adds a one-pixel ink outline around the art, then scales up crisply."""
        alpha = self.px[..., 3] > 0
        grown = alpha.copy()
        grown[1:] |= alpha[:-1]; grown[:-1] |= alpha[1:]; grown[:, 1:] |= alpha[:, :-1]; grown[:, :-1] |= alpha[:, 1:]
        out = self.px.copy()
        out[grown & ~alpha] = INK
        image = Image.fromarray(out, "RGBA")
        return image.resize((self.w * scale, self.h * scale), Image.NEAREST)


def icon(name: str) -> Image.Image:
    c = Canvas()
    if name == "spirit-peach":
        c.ellipse(8, 9.5, 5.5, 5, "#f07d8c"); c.ellipse(9.5, 10.5, 3.5, 3.5, "#e0566d")
        c.line(8, 5, 8, 14, "#c94060"); c.ellipse(6, 8, 1.6, 1.6, "#ffd2d8")
        c.poly([(8, 5), (12, 2), (13, 4), (9, 6)], "#6cc46b"); c.line(9, 5, 12, 3, "#3f8d4a")
    elif name == "jade-elixir":
        c.rect(6, 2, 9, 4, "#c9a46a"); c.rect(5, 4, 10, 5, "#8a6a3e")
        c.ellipse(7.5, 10.5, 5, 4.6, "#bfe8d8"); c.ellipse(7.5, 11.2, 4, 3.4, "#3fbf98")
        c.ellipse(6, 9.5, 1.3, 1.3, "#e9fff7"); c.rect(9, 12, 10, 12, "#2a9a78")
    elif name == "qi-crystal":
        c.poly([(8, 1), (13, 7), (8, 15), (3, 7)], "#5ad9ed"); c.poly([(8, 1), (13, 7), (8, 8)], "#9cf0ff")
        c.poly([(3, 7), (8, 8), (8, 15)], "#2f8fd6"); c.line(8, 2, 8, 14, "#d8fbff")
    elif name == "echo-shard":
        c.poly([(8, 3), (12, 8), (8, 13), (4, 8)], "#f0d48a"); c.poly([(8, 3), (12, 8), (8, 8)], "#fff1c2")
        c.poly([(4, 8), (8, 8), (8, 13)], "#b8913f"); c.dot(7, 6, "#ffffff")
    elif name == "whetstone-talisman":
        c.rect(4, 2, 11, 14, "#f2e6c4"); c.rect(4, 2, 11, 3, "#c94a3c"); c.rect(4, 13, 11, 14, "#c94a3c")
        c.line(6, 6, 9, 6, "#7a2a22"); c.line(7, 5, 7, 11, "#7a2a22"); c.line(6, 9, 10, 9, "#7a2a22"); c.line(9, 8, 9, 11, "#7a2a22")
    elif name == "crane-feather":
        c.poly([(3, 14), (11, 3), (13, 4), (6, 13)], "#eef3f6"); c.poly([(11, 3), (13, 4), (12, 6), (10, 5)], "#2b2f36")
        c.line(4, 13, 12, 4, "#9fb2bd"); c.dot(3, 14, "#c94a3c")
    elif name == "phoenix-ember":
        c.poly([(8, 1), (12, 7), (11, 12), (8, 15), (5, 12), (4, 7)], "#ff7a3c")
        c.poly([(8, 5), (10, 9), (8, 13), (6, 9)], "#ffd27a"); c.dot(8, 10, "#ffffff")
    elif name == "mirror-charm":
        c.ellipse(8, 7, 5, 5, "#c9a46a"); c.ellipse(8, 7, 3.6, 3.6, "#cfe6ef"); c.line(6, 5, 9, 8, "#ffffff")
        c.rect(7, 12, 8, 15, "#8a6a3e"); c.rect(6, 15, 9, 15, "#c94a3c")
    elif name == "spirit-lantern":
        c.rect(7, 1, 8, 2, "#8a6a3e"); c.rect(4, 3, 11, 4, "#5a3f24"); c.rect(4, 12, 11, 13, "#5a3f24")
        c.rect(5, 5, 10, 11, "#f0a53b"); c.rect(6, 6, 9, 10, "#ffd982"); c.rect(7, 7, 8, 9, "#ffffff")
    elif name == "thorn-seal":
        for k in range(8):
            a = k * math.pi / 4
            c.poly([(8 + math.cos(a - 0.3) * 4, 8 + math.sin(a - 0.3) * 4), (8 + math.cos(a) * 7.5, 8 + math.sin(a) * 7.5), (8 + math.cos(a + 0.3) * 4, 8 + math.sin(a + 0.3) * 4)], "#7e9a5a")
        c.ellipse(8, 8, 4.5, 4.5, "#a33d4a"); c.ellipse(8, 8, 2.4, 2.4, "#f0d48a")
    elif name.endswith("-infusion"):
        base = {"frost": ("#9cf0ff", "#3f8fd6", "#e9fbff"), "storm": ("#e7d4ff", "#7d4fd6", "#ffffff"), "ember": ("#ffb060", "#d4492f", "#fff1c2")}[name.split("-")[0]]
        c.ellipse(8, 8, 6, 6, base[1]); c.ellipse(7, 7, 4.4, 4.4, base[0]); c.ellipse(6, 6, 1.4, 1.4, base[2])
        if name.startswith("frost"):
            c.line(8, 4, 8, 12, base[2]); c.line(5, 6, 11, 10, base[2]); c.line(5, 10, 11, 6, base[2])
        elif name.startswith("storm"):
            c.poly([(9, 3), (6, 9), (8, 9), (7, 13), (11, 7), (9, 7)], base[2])
        else:
            c.poly([(8, 4), (11, 9), (8, 13), (5, 9)], base[2])
    elif name.startswith("art-"):
        # A sealed technique scroll, ribboned in the realm's colour.
        ribbon = {"art-sectless": "#5fe0c4", "art-nightfold": "#b881ff", "art-moonfox": "#57d8ff"}[name]
        c.rect(3, 4, 12, 11, "#f2e6c4"); c.rect(2, 3, 3, 12, "#8a6a3e"); c.rect(12, 3, 13, 12, "#8a6a3e")
        c.line(5, 6, 10, 6, "#7a6a50"); c.line(5, 8, 10, 8, "#7a6a50")
        c.rect(7, 3, 8, 12, ribbon); c.ellipse(7.5, 10, 2, 2, "#c94a3c")
    elif name == "jade-slip":
        # A carved jade strip with a red cord and rows of tiny characters.
        c.rect(5, 1, 10, 14, "#4fa88a"); c.rect(5, 1, 10, 2, "#8fe0c0"); c.rect(5, 13, 10, 14, "#2f6f62")
        c.rect(5, 1, 5, 14, "#6fd0ae"); c.rect(10, 1, 10, 14, "#2f6f62")
        for y in (4, 6, 8, 10):
            c.line(7, y, 8, y, "#1d4a42"); c.dot(8, y + 1, "#1d4a42")
        c.rect(6, 12, 9, 12, "#c94a3c"); c.dot(7, 11, "#c94a3c"); c.dot(8, 11, "#c94a3c")
    return c.finish()


def chest(kind: str, frame: int) -> Image.Image:
    """frame 0 closed; 1..4 the lid lifts and tips back while light spills out."""
    c = Canvas(24, 22)
    wood, wood_dark, wood_light, band, band_light, glow = (
        ("#8a5a34", "#5a3a22", "#b37a48", "#7d8a8f", "#c9d4d8", "#ffd982") if kind == "room"
        else ("#2f6f62", "#1d4a42", "#4fa08a", "#d5b66c", "#fff1c2", "#9cf0ff")
    )
    c.ellipse(12, 20, 10, 2, "#00000055")
    # Body.
    c.rect(2, 9, 21, 19, wood); c.rect(2, 9, 21, 10, wood_light); c.rect(2, 18, 21, 19, wood_dark)
    for x in (7, 16):
        c.rect(x, 9, x, 19, wood_dark)
    c.rect(2, 12, 21, 13, band); c.rect(2, 12, 21, 12, band_light)
    if kind == "warden":
        for x in (4, 19):
            c.rect(x - 1, 9, x + 1, 19, band); c.rect(x - 1, 9, x - 1, 19, band_light)
        c.dot(12, 16, "#e0475a"); c.dot(6, 16, "#9cf0ff"); c.dot(17, 16, "#9cf0ff")
    # Lid: lifts and foreshortens as it opens.
    lift = [0, 2, 4, 6, 7][frame]
    depth = [6, 5, 3, 2, 1][frame]
    top = 9 - depth - lift
    if frame > 0:
        c.rect(3, 9 - min(lift, 3), 20, 10, glow)
        for k in range(frame):
            c.line(6 + k * 4, 8 - lift, 5 + k * 5, 1, glow)
    c.rect(1, top, 22, top + depth, wood); c.rect(1, top, 22, top, wood_light)
    c.rect(1, top + depth, 22, top + depth, band)
    if frame == 0:
        c.rect(10, 9, 13, 13, band_light); c.rect(11, 11, 12, 12, wood_dark)
    return c.finish()


def main() -> None:
    destination = ROOT / "public" / "assets" / "items"
    destination.mkdir(parents=True, exist_ok=True)
    sheet = Image.new("RGBA", (ITEM_CELL * len(ITEM_ORDER), ITEM_CELL))
    for index, name in enumerate(ITEM_ORDER):
        sheet.alpha_composite(icon(name), (index * ITEM_CELL, 0))
    sheet.save(destination / "items.png", optimize=True)
    chests = Image.new("RGBA", (CHEST_W * CHEST_FRAMES, CHEST_H * 2))
    for row, kind in enumerate(("room", "warden")):
        for frame in range(CHEST_FRAMES):
            chests.alpha_composite(chest(kind, frame), (frame * CHEST_W, row * CHEST_H))
    chests.save(destination / "chests.png", optimize=True)
    print(f"items.png ({len(ITEM_ORDER)} icons), chests.png ({CHEST_FRAMES} frames x 2)")


if __name__ == "__main__":
    main()

"""Draw room cover and special-room props procedurally (pixel art, no image model).

Writes public/assets/rooms/ (16px art scaled 2x with an ink outline, frames in one row):
  cover-<realm>.png  5 frames 32x56  pillar, urn, urn cracking, urn bursting, urn shards
  merchant.png       2 frames 80x64  the Wandering Peddler's stall, lantern flickering
  altar.png          3 frames 48x56  Heart-Blood Altar lit (x2), spent
  bell.png           4 frames 48x64  Bell of Trials still, swing left, swing right, silent
  pedestal.png       1 frame  32x20  a ware's stand
  dummy.png          3 frames 32x56  training dummy upright, struck left, struck right
Frame counts and sizes must match src/game/RoomFeatureSystem.ts.

Run:  python tools/generate_room_feature_sprites.py   (needs numpy, Pillow)
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location("items", ROOT / "tools" / "generate_item_sprites.py")
_items = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_items)
Canvas = _items.Canvas

REALMS = {
    # pillar body, light, dark, band, urn body, urn light, urn dark, urn accent
    "sectless-temple": ("#cfd6d2", "#eef3ef", "#8e9994", "#d7b25a", "#8fc9a8", "#c6ecd6", "#4f8a6c", "#e9d48a"),
    "nightfold-crypt": ("#3a3448", "#5a5170", "#201b2b", "#9b6bff", "#2b2633", "#4a4256", "#16121c", "#b77cff"),
    "foxfire-shrine": ("#c8463a", "#ee7a62", "#7e2422", "#f2d58a", "#efe7da", "#ffffff", "#b7ab9c", "#4f7fd6"),
}


def pillar(c: Canvas, palette: tuple[str, ...], realm: str) -> None:
    body, light, dark, band = palette[:4]
    # Base plinth, shaft, capital.
    c.rect(2, 24, 13, 27, "#5d625f" if realm != "nightfold-crypt" else "#17131d")
    c.rect(2, 24, 13, 24, "#7d837f" if realm != "nightfold-crypt" else "#2c2536")
    c.rect(4, 5, 11, 23, body)
    c.rect(4, 5, 5, 23, light)
    c.rect(10, 5, 11, 23, dark)
    c.rect(3, 2, 12, 4, body); c.rect(3, 2, 12, 2, light); c.rect(2, 4, 13, 4, dark)
    for y in (7, 20):
        c.rect(4, y, 11, y, band)
    if realm == "sectless-temple":
        # A carved sword glyph.
        c.line(8, 10, 8, 17, "#a3aca7"); c.rect(7, 11, 9, 11, "#a3aca7")
    elif realm == "nightfold-crypt":
        for y in (10, 13, 16):
            c.dot(7, y, band); c.dot(8, y + 1, band)
    else:
        # A paper charm tied to the post.
        c.rect(6, 10, 9, 16, "#f6efd8"); c.line(7, 11, 7, 15, "#c8463a"); c.line(8, 12, 8, 14, "#c8463a")
        c.rect(5, 9, 10, 9, "#e8d9a8")


def urn(c: Canvas, palette: tuple[str, ...], frame: int) -> None:
    body, light, dark, accent = palette[4:]
    top = 15
    if frame <= 1:
        c.ellipse(8, top + 7.5, 5.5, 5.2, body)
        c.ellipse(6.5, top + 6, 1.8, 2.4, light)
        c.ellipse(9.8, top + 9.2, 2.2, 2.0, dark)
        c.rect(5, top + 1, 10, top + 2, body); c.rect(5, top + 1, 10, top + 1, light)
        c.rect(4, top + 7, 12, top + 7, accent)
        if frame == 1:
            c.line(9, top + 3, 7, top + 7, "#1a1414"); c.line(7, top + 7, 9, top + 10, "#1a1414")
    elif frame == 2:
        # Bursting: the halves fly apart with a puff of qi.
        c.poly([(3, top + 6), (7, top + 4), (7, top + 12), (3, top + 11)], body)
        c.poly([(9, top + 3), (13, top + 6), (13, top + 12), (9, top + 11)], dark)
        c.rect(7, top + 2, 8, top + 4, light)
        for x, y in ((2, top + 2), (14, top + 3), (8, top), (5, top + 13), (11, top + 13)):
            c.dot(x, y, accent)
    else:
        for x, y, colour in ((3, top + 11, body), (6, top + 12, dark), (10, top + 11, body), (12, top + 12, light), (8, top + 12, accent)):
            c.rect(x, y, x + 1, y, colour)


def cover_sheet(realm: str) -> Image.Image:
    palette = REALMS[realm]
    sheet = Image.new("RGBA", (32 * 5, 56))
    for frame in range(5):
        c = Canvas(16, 28)
        if frame == 0:
            pillar(c, palette, realm)
        else:
            urn(c, palette, frame - 1)
        sheet.alpha_composite(c.finish(), (frame * 32, 0))
    return sheet


def merchant(frame: int) -> Image.Image:
    c = Canvas(40, 32)
    # Mat and crates.
    c.rect(4, 25, 35, 29, "#6a3d2a"); c.rect(4, 25, 35, 25, "#8c5a3c")
    c.rect(6, 18, 15, 25, "#9a6b3e"); c.rect(6, 18, 15, 18, "#c08f58"); c.line(6, 21, 15, 21, "#6a4526")
    c.rect(25, 19, 34, 25, "#9a6b3e"); c.rect(25, 19, 34, 19, "#c08f58"); c.line(29, 19, 29, 25, "#6a4526")
    # Poles and awning.
    c.rect(4, 5, 5, 25, "#5a3a24"); c.rect(34, 5, 35, 25, "#5a3a24")
    c.poly([(1, 7), (20, 1), (38, 7), (38, 10), (1, 10)], "#3f7f6a")
    for x in range(2, 38, 6):
        c.rect(x, 7, x + 2, 10, "#e9d48a")
    c.rect(1, 10, 38, 10, "#2a5446")
    # The peddler: a hooded figure with a wide straw hat.
    c.ellipse(20, 20, 5, 6, "#4b4560"); c.rect(16, 22, 24, 26, "#4b4560")
    c.ellipse(20, 15.5, 2.6, 2.6, "#f0d2b0")
    c.poly([(13, 14), (20, 10), (27, 14)], "#d8b768"); c.rect(14, 14, 26, 14, "#a88a44")
    c.dot(19, 16, "#2a2230"); c.dot(21, 16, "#2a2230")
    # Hanging lantern.
    glow = "#ffe08a" if frame == 0 else "#ffc45a"
    c.line(32, 10, 32, 12, "#2a2230")
    c.ellipse(32, 15, 2.5, 3, "#d9483b"); c.rect(31, 13, 33, 17, glow)
    c.rect(31, 12, 33, 12, "#2a2230"); c.rect(31, 18, 33, 18, "#2a2230")
    return c.finish()


def altar(frame: int) -> Image.Image:
    c = Canvas(24, 28)
    c.rect(2, 22, 21, 27, "#4a3b3b"); c.rect(2, 22, 21, 22, "#6a5555")
    c.rect(4, 13, 19, 21, "#5c4646"); c.rect(4, 13, 19, 13, "#7c6262"); c.rect(18, 14, 19, 21, "#3a2c2c")
    c.rect(3, 11, 20, 12, "#7c6262")
    # Carved heart sigil.
    c.rect(9, 16, 10, 17, "#2a1c1c"); c.rect(13, 16, 14, 17, "#2a1c1c"); c.rect(10, 18, 13, 18, "#2a1c1c"); c.rect(11, 19, 12, 19, "#2a1c1c")
    if frame < 2:
        # A bowl of blood-qi with a rising flame.
        c.ellipse(11.5, 10, 5, 1.6, "#3a1416"); c.ellipse(11.5, 9.6, 4, 1.1, "#d23a4a")
        height = 6 if frame == 0 else 7
        for row in range(height):
            width = max(0.6, 3.0 * (1 - row / height))
            colour = "#ffd0d6" if row < 2 else "#ff6a7a" if row < 4 else "#c22a3c"
            c.rect(round(11.5 - width), 8 - row, round(11.5 + width), 8 - row, colour)
        c.rect(9, 16, 10, 17, "#ff6a7a"); c.rect(13, 16, 14, 17, "#ff6a7a"); c.rect(10, 18, 13, 18, "#ff6a7a"); c.rect(11, 19, 12, 19, "#ff6a7a")
    else:
        c.ellipse(11.5, 10, 5, 1.6, "#3a1416"); c.ellipse(11.5, 9.6, 4, 1.1, "#4a2a2c")
    return c.finish()


def bell(frame: int) -> Image.Image:
    c = Canvas(24, 32)
    # Frame of two posts and a beam.
    c.rect(2, 4, 3, 31, "#5a3a24"); c.rect(20, 4, 21, 31, "#5a3a24")
    c.rect(0, 2, 23, 4, "#7a4a2c"); c.rect(0, 2, 23, 2, "#9a6a44")
    c.rect(0, 29, 5, 31, "#3e2a1c"); c.rect(18, 29, 23, 31, "#3e2a1c")
    swing = [0, -2, 2, 0][frame]
    body = "#c79a4a" if frame != 3 else "#6e6250"
    light = "#f0cf7a" if frame != 3 else "#8a7e6a"
    dark = "#8a6a2e" if frame != 3 else "#4a4236"
    cx = 11.5 + swing
    c.line(11, 4, round(cx), 7, "#2a2230")
    c.poly([(cx - 3, 7), (cx + 3, 7), (cx + 6, 22), (cx - 6, 22)], body)
    c.poly([(cx - 3, 7), (cx - 1, 7), (cx - 3, 22), (cx - 6, 22)], light)
    c.poly([(cx + 2, 7), (cx + 3, 7), (cx + 6, 22), (cx + 4, 22)], dark)
    c.rect(round(cx - 6), 22, round(cx + 6), 23, dark)
    for y in (11, 17):
        c.rect(round(cx - 4), y, round(cx + 4), y, dark)
    if frame in (1, 2):
        side = -1 if frame == 1 else 1
        for k in range(3):
            c.dot(round(cx + side * (9 + k)), 12 + k * 3, "#fff1c2")
    return c.finish()


def pedestal() -> Image.Image:
    c = Canvas(16, 10)
    c.rect(2, 6, 13, 9, "#4f4a44"); c.rect(2, 6, 13, 6, "#6f6a62")
    c.rect(4, 2, 11, 5, "#6a4a7a"); c.rect(4, 2, 11, 2, "#8c6aa0")
    return c.finish()


def dummy(frame: int) -> Image.Image:
    """A straw training dummy on a post, with a paper target and red sash."""
    c = Canvas(16, 28)
    lean = [0, -1, 1][frame]
    c.rect(2, 25, 13, 27, "#4a3826"); c.rect(2, 25, 13, 25, "#6a5236")
    c.rect(7, 14, 8, 25, "#6b4a2c"); c.rect(7, 14, 7, 25, "#8a6440")
    top = 4
    cx = 7.5 + lean
    c.rect(round(cx - 6), top + 6, round(cx + 6), top + 7, "#7a5530")
    c.ellipse(cx, top + 10, 4.2, 5.5, "#d8b768")
    for y in range(top + 6, top + 15, 2):
        c.rect(round(cx - 3), y, round(cx + 3), y, "#b8963f")
    c.rect(round(cx - 4), top + 11, round(cx + 4), top + 12, "#b8322f")
    c.ellipse(cx, top + 2.5, 3.0, 3.0, "#e8d6a6")
    c.ellipse(cx, top + 2.5, 1.8, 1.8, "#c8463a"); c.dot(round(cx), top + 2, "#f6efd8")
    for k in range(3):
        c.dot(round(cx - 6 - k * 0.2), top + 6 + k, "#d8b768"); c.dot(round(cx + 6 + k * 0.2), top + 6 + k, "#d8b768")
    return c.finish()


def strip(frames: list[Image.Image]) -> Image.Image:
    width, height = frames[0].size
    sheet = Image.new("RGBA", (width * len(frames), height))
    for index, frame in enumerate(frames):
        sheet.alpha_composite(frame, (index * width, 0))
    return sheet


def main() -> None:
    destination = ROOT / "public" / "assets" / "rooms"
    destination.mkdir(parents=True, exist_ok=True)
    for realm in REALMS:
        cover_sheet(realm).save(destination / f"cover-{realm}.png", optimize=True)
    strip([merchant(0), merchant(1)]).save(destination / "merchant.png", optimize=True)
    strip([altar(0), altar(1), altar(2)]).save(destination / "altar.png", optimize=True)
    strip([bell(frame) for frame in range(4)]).save(destination / "bell.png", optimize=True)
    pedestal().save(destination / "pedestal.png", optimize=True)
    strip([dummy(frame) for frame in range(3)]).save(destination / "dummy.png", optimize=True)
    print(f"wrote room feature sprites to {destination}")


if __name__ == "__main__":
    main()

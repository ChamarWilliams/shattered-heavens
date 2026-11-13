"""Draw the boss-portal sprite sheets procedurally (pixel art, no image model).

For each dungeon theme this writes public/assets/dungeons/<theme>/portal/:
  portal-open.png  OPEN_FRAMES frames: a slit of light tears open into the rift
  portal-idle.png  IDLE_FRAMES frames: the rift swirls, runes orbit, sparks fall in
Frames are FRAME_W x FRAME_H, laid out in one row. The art is drawn at twice the
world resolution; DungeonRunScene shows it at scale 0.5.

Run:  python tools/generate_portal_sprites.py   (needs numpy, Pillow)
"""

from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
FRAME_W, FRAME_H = 160, 224
OPEN_FRAMES, IDLE_FRAMES = 10, 8
# Rift oval and the light pool on the floor beneath it (frame pixels).
CX, CY, RX, RY = 80.0, 104.0, 50.0, 80.0
GX, GY, GRX, GRY = 80.0, 198.0, 64.0, 13.0
ARMS = 3
RUNES = 10
SPARKS = 16

# Dark-to-light ramp around each theme's door colour, plus its gold accent.
PALETTES = {
    "sectless-temple": ["#04161a", "#0a3a3c", "#13706a", "#2fb5a6", "#6ee7e5", "#c9fff6", "#ffffff"],
    "nightfold-crypt": ["#0b0618", "#261147", "#4d2690", "#7d4fd6", "#b881ff", "#e7d4ff", "#ffffff"],
    "foxfire-shrine": ["#050f22", "#0d2f63", "#1858b0", "#2f97e8", "#57d8ff", "#cdf3ff", "#ffffff"],
}
ACCENTS = {"sectless-temple": "#f0cf7a", "nightfold-crypt": "#f2a3ff", "foxfire-shrine": "#ffd27a"}
BAYER = (np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) + 0.5) / 16


def rgb(hex_colour: str) -> np.ndarray:
    return np.array([int(hex_colour[i:i + 2], 16) for i in (1, 3, 5)], dtype=np.float32)


def ease_out_back(x: float) -> float:
    x = min(1.0, max(0.0, x))
    c1, c3 = 1.70158, 2.70158
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2


def draw_frame(theme: str, t: float, width: float, height: float, flash: float, extras: float) -> Image.Image:
    """t: loop phase in [0, 1); width/height: rift size factors; flash: 0..1 white-out;
    extras: 0..1 visibility of runes, sparks and the floor glow."""
    ramp = np.stack([rgb(colour) for colour in PALETTES[theme]])
    accent = rgb(ACCENTS[theme])
    rgba = np.zeros((FRAME_H, FRAME_W, 4), dtype=np.float32)
    yy, xx = np.mgrid[0:FRAME_H, 0:FRAME_W].astype(np.float32) + 0.5
    dither = BAYER[(yy.astype(int) % 4), (xx.astype(int) % 4)]

    def put(mask: np.ndarray, colour: np.ndarray, alpha: float | np.ndarray = 1.0) -> None:
        # Straight-alpha "over": translucent pixels keep their true colour.
        a = np.where(mask, alpha, 0.0)
        below = rgba[..., 3] / 255
        out = a + below * (1 - a)
        safe = np.where(out > 0, out, 1)
        rgba[..., :3] = (colour * a[..., None] + rgba[..., :3] * (below * (1 - a))[..., None]) / safe[..., None]
        rgba[..., 3] = out * 255

    # Light pool on the floor, in three dithered alpha steps.
    ground = np.hypot((xx - GX) / GRX, (yy - GY) / GRY)
    pulse = 0.85 + 0.15 * math.sin(t * 2 * math.pi)
    for limit, alpha, shade in ((1.0, 0.4, 3), (0.72, 0.55, 4), (0.42, 0.75, 5)):
        put((ground < limit) & (dither < 0.75), ramp[shade], alpha * pulse * extras)

    rx, ry = RX * max(width, 0.02), RY * max(height, 0.02)
    dx, dy = (xx - CX) / rx, (yy - CY) / ry
    r = np.hypot(dx, dy)
    theta = np.arctan2(dy, dx)

    # Outer halo, then a dark outline that keeps the rim crisp against any floor.
    halo = (r >= 1.0) & (r < 1.24)
    put(halo & (dither < np.clip(1.25 - r, 0, 1) * 3.2), ramp[4], 0.55)
    put((r >= 1.0) & (r < 1.06), ramp[0], 0.95)

    # Swirling interior: a log spiral that turns one arm-spacing per loop.
    inside = r < 1.0
    swirl = 0.5 + 0.5 * np.sin(ARMS * theta + 5.2 * np.log(r + 0.06) - 2 * math.pi * t)
    core = np.exp(-(r / 0.24) ** 2)
    tone = 0.12 + 0.55 * swirl * (0.35 + 0.65 * r) + 0.75 * core + 0.25 * r ** 6
    tone = np.clip(tone * (1 - flash) + flash, 0, 1)
    index = np.clip(np.floor(tone * (len(ramp) - 1) + dither - 0.5), 0, len(ramp) - 1).astype(int)
    put(inside, ramp[index])

    # Bright, flickering rim.
    rim = (r >= 0.88) & (r < 1.0)
    sparkle = np.sin(theta * 14 + 4 * math.pi * t) > 0.25
    put(rim, ramp[5])
    put(rim & sparkle & (r > 0.93), ramp[6])

    # Gold runes orbiting the rim; they advance one slot per loop so it repeats.
    for index_rune in range(RUNES):
        angle = 2 * math.pi * (index_rune + t) / RUNES
        px = CX + math.cos(angle) * rx * 1.15
        py = CY + math.sin(angle) * ry * 1.12
        if extras <= 0.05:
            continue
        cross = ((np.abs(xx - px) < 1.6) & (np.abs(yy - py) < 3.6)) | ((np.abs(xx - px) < 3.6) & (np.abs(yy - py) < 1.6))
        put(cross, accent, extras)
        put((np.abs(xx - px) < 1.1) & (np.abs(yy - py) < 1.1), rgb("#ffffff"), extras)

    # Sparks drawn in along the spiral and swallowed by the core.
    for index_spark in range(SPARKS):
        u = (index_spark / SPARKS + t) % 1.0
        radius = 1.45 * (1 - u) + 0.12
        angle = index_spark * 2.39996 + u * 3.2 * math.pi
        px = CX + math.cos(angle) * rx * radius
        py = CY + math.sin(angle) * ry * radius
        size = 2.4 if u < 0.6 else 1.6
        alpha = extras * min(1.0, u * 5) * (1 - max(0.0, u - 0.85) / 0.15)
        put((np.abs(xx - px) < size / 2 + 0.5) & (np.abs(yy - py) < size / 2 + 0.5), ramp[6] if index_spark % 3 else accent, alpha)

    rgba = np.clip(rgba, 0, 255).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def build(theme: str) -> None:
    destination = ROOT / "public" / "assets" / "dungeons" / theme / "portal"
    destination.mkdir(parents=True, exist_ok=True)

    idle = Image.new("RGBA", (FRAME_W * IDLE_FRAMES, FRAME_H))
    for frame in range(IDLE_FRAMES):
        idle.alpha_composite(draw_frame(theme, frame / IDLE_FRAMES, 1, 1, 0, 1), (frame * FRAME_W, 0))
    idle.save(destination / "portal-idle.png", optimize=True)

    opening = Image.new("RGBA", (FRAME_W * OPEN_FRAMES, FRAME_H))
    for frame in range(OPEN_FRAMES):
        s = (frame + 1) / OPEN_FRAMES
        if s <= 0.3:
            # A thin vertical tear of light grows to full height.
            width, height, flash, extras = 0.07, 0.1 + 0.9 * (1 - (1 - s / 0.3) ** 2), 1.0, 0.0
        else:
            k = (s - 0.3) / 0.7
            width, height, flash, extras = 0.07 + 0.93 * ease_out_back(k), 1.0, (1 - k) ** 2 * 0.85, k
        opening.alpha_composite(draw_frame(theme, s * 0.5 % 1.0, width, height, flash, extras), (frame * FRAME_W, 0))
    opening.save(destination / "portal-open.png", optimize=True)
    print(f"{theme}: {destination.relative_to(ROOT)}/portal-open.png, portal-idle.png")


if __name__ == "__main__":
    for theme_id in PALETTES:
        build(theme_id)

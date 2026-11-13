"""Normalize generated projectile cutouts into small, transparent runtime assets."""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image


CANVAS = (192, 96)
ALPHA_THRESHOLD = 10


def normalize(source: Path, destination: Path) -> None:
    image = Image.open(source).convert("RGBA")
    alpha = image.getchannel("A")
    mask = alpha.point(lambda value: 255 if value > ALPHA_THRESHOLD else 0)
    bounds = mask.getbbox()
    if bounds is None:
        raise ValueError(f"{source} contains no visible pixels")

    cutout = image.crop(bounds)
    cutout.thumbnail((CANVAS[0] - 12, CANVAS[1] - 12), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    canvas.alpha_composite(cutout, ((CANVAS[0] - cutout.width) // 2, (CANVAS[1] - cutout.height) // 2))
    destination.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(destination, optimize=True)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: normalize_projectile_assets.py SOURCE DESTINATION")
    normalize(Path(sys.argv[1]), Path(sys.argv[2]))

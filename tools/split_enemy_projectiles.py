"""Normalize four-quadrant projectile source sheets into runtime sprites."""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image


ROLES = ("hunter", "heavy", "sentinel", "boss")
QUADRANTS = ((0, 0, 768, 512), (768, 0, 1536, 512), (0, 512, 768, 1024), (768, 512, 1536, 1024))
OUTPUT_SIZE = 128
CONTENT_SIZE = 112


def normalize(cell: Image.Image) -> Image.Image:
    alpha = cell.getchannel("A")
    threshold = alpha.point(lambda value: 255 if value >= 10 else 0)
    bounds = threshold.getbbox()
    if bounds is None:
        raise ValueError("projectile quadrant has no visible pixels")
    cropped = cell.crop(bounds)
    scale = min(CONTENT_SIZE / cropped.width, CONTENT_SIZE / cropped.height)
    resized = cropped.resize(
        (max(1, round(cropped.width * scale)), max(1, round(cropped.height * scale))),
        Image.Resampling.LANCZOS,
    )
    output = Image.new("RGBA", (OUTPUT_SIZE, OUTPUT_SIZE), (0, 0, 0, 0))
    output.alpha_composite(resized, ((OUTPUT_SIZE - resized.width) // 2, (OUTPUT_SIZE - resized.height) // 2))
    return output


def split(source_path: Path, output_directory: Path) -> None:
    source = Image.open(source_path).convert("RGBA")
    if source.size != (1536, 1024):
        raise ValueError(f"expected 1536x1024 source sheet, got {source.size}")
    output_directory.mkdir(parents=True, exist_ok=True)
    for role, bounds in zip(ROLES, QUADRANTS, strict=True):
        normalize(source.crop(bounds)).save(output_directory / f"projectile-{role}-v4.png", optimize=True)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: split_enemy_projectiles.py SOURCE_SHEET OUTPUT_DIRECTORY")
    split(Path(sys.argv[1]), Path(sys.argv[2]))

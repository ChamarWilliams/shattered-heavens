"""Bake every valid dungeon door mask into a complete, immutable room bitmap.

The four-way master contains genuine openings on every side. For each mask we
cover only directions that do not exist in that room. Runtime code selects one
finished bitmap and never adds or removes doorway artwork.
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


DOOR_BITS = {"N": 1, "E": 2, "S": 4, "W": 8}

# Door regions include their complete authored thresholds. Soft edges blend the
# opening into the matching solid-wall master without rectangular crop seams.
OPENING_RECTS = {
    "N": (625, 0, 911, 235),
    "E": (1296, 330, 1536, 695),
    "S": (605, 765, 931, 1024),
    "W": (0, 330, 240, 695),
}


def opening_mask(direction: str) -> Image.Image:
    mask = Image.new("L", (1536, 1024), 0)
    ImageDraw.Draw(mask).rectangle(OPENING_RECTS[direction], fill=255)
    return mask.filter(ImageFilter.GaussianBlur(radius=12))


def build(solid_path: Path, four_way_path: Path, output_directory: Path) -> None:
    solid = Image.open(solid_path).convert("RGB")
    four_way = Image.open(four_way_path).convert("RGB")
    if solid.size != (1536, 1024) or four_way.size != (1536, 1024):
        raise ValueError(f"expected 1536x1024 room masters, got {solid.size} and {four_way.size}")

    output_directory.mkdir(parents=True, exist_ok=True)
    masks = {direction: opening_mask(direction) for direction in DOOR_BITS}

    for mask in range(1, 16):
        combined = Image.new("L", solid.size, 0)
        for direction, bit in DOOR_BITS.items():
            if mask & bit:
                combined = ImageChops.lighter(combined, masks[direction])
        variant = Image.composite(four_way, solid, combined)
        variant.save(output_directory / f"room-mask-{mask:02d}-v5.webp", "WEBP", quality=92, method=6)


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit("usage: build_static_room_variants.py SOLID_MASTER FOUR_WAY_MASTER OUTPUT_DIRECTORY")
    build(Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]))

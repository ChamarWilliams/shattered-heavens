"""Build small wall-continuation patches from each authored room background."""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image


# Coordinates target the shared 1536 x 1024 authored arena composition.
# Each source is an intact piece of the same wall on the same side, so the
# closure retains the room's material, perspective, lighting, and scale.
PATCHES = {
    "N": ((675, 0, 861, 205), (930, 0, 1116, 205)),
    "S": ((675, 819, 861, 1024), (930, 819, 1116, 1024)),
    "W": ((0, 390, 190, 634), (0, 105, 190, 349)),
    "E": ((1346, 390, 1536, 634), (1346, 105, 1536, 349)),
}


def build(source: Path, destination: Path) -> None:
    room = Image.open(source).convert("RGBA")
    if room.size != (1536, 1024):
        raise ValueError(f"expected 1536x1024 room art, got {room.size} for {source}")
    destination.mkdir(parents=True, exist_ok=True)
    for direction, (_, source_bounds) in PATCHES.items():
        room.crop(source_bounds).save(destination / f"closure-{direction}-v4.png", optimize=True)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: build_room_door_closures.py ROOM_IMAGE OUTPUT_DIRECTORY")
    build(Path(sys.argv[1]), Path(sys.argv[2]))

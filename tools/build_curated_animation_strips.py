from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

from PIL import Image


FRAME_SIZE = 384
DIRECTIONS = ("N", "NE", "E", "SE", "S", "SW", "W", "NW")

# Each entry is (source pack, source animation, zero-based frame index). No pixels
# are synthesized. Unrecoverable board cuts are replaced by intact supplied poses.
RECIPES: dict[str, dict[str, list[tuple[str, str, int]]]] = {
    "li_yunfeng": {
        "idle": [("original", "idle", 1)] * 4,
        "move": [("original", "move", 1), ("original", "move", 1), ("original", "move", 5), ("original", "move", 5), ("original", "move", 1), ("original", "move", 5)],
        "basic_attack": [("original", "basic_attack", 0), ("replacement", "basic_attack", 1), ("replacement", "basic_attack", 1), ("replacement", "basic_attack", 1), ("original", "basic_attack", 4)],
        "active_ability": [
            ("original", "idle", 1),
            ("original", "move", 1),
            ("original", "move", 5),
            ("original", "move", 1),
            ("original", "move", 5),
            ("original", "move", 1),
            ("original", "idle", 1),
            ("original", "idle", 1),
        ],
        "hurt": [("original", "hurt", 1), ("original", "hurt", 1), ("original", "hurt", 2)],
        "death": [("original", "death", 1), ("original", "death", 1), ("original", "death", 2), ("original", "death", 3), ("original", "death", 4), ("original", "death", 5)],
    },
    "seo_jiwon": {
        "idle": [("original", "idle", 0)] * 4,
        "move": [("original", "move", 0), ("original", "move", 1), ("original", "move", 2), ("original", "move", 3), ("original", "move", 2), ("original", "move", 1)],
        "basic_attack": [("original", "move", 0), ("replacement", "basic_attack", 1), ("replacement", "basic_attack", 1), ("replacement", "basic_attack", 1), ("original", "move", 3)],
        "active_ability": [("original", "move", i) for i in (0, 1, 2, 3, 2, 1, 0, 3)],
        "hurt": [("original", "idle", 0), ("original", "idle", 1), ("original", "idle", 2)],
        "death": [("replacement", "death", i) for i in (3, 3, 4, 4, 4, 4)],
    },
    "tsukishiro_rei": {
        "idle": [("original", "idle", 0)] * 4,
        "move": [("original", "move", i) for i in (1, 2, 3, 2, 1, 3)],
        "basic_attack": [("original", "move", i) for i in (1, 2, 3, 2, 1)],
        "active_ability": [("original", "move", i) for i in (1, 2, 3, 2, 1, 2, 3, 1)],
        "hurt": [("original", "hurt", 2), ("original", "hurt", 2), ("original", "hurt", 2)],
        "death": [("replacement", "death", i) for i in (3, 3, 4, 4, 4, 4)],
    },
}


def original_frame(root: Path, hero: str, action: str, index: int) -> Image.Image:
    sheet = Image.open(root / hero / action / "S.png").convert("RGBA")
    return sheet.crop((index * FRAME_SIZE, 0, (index + 1) * FRAME_SIZE, FRAME_SIZE))


def replacement_frame(root: Path, hero: str, action: str, index: int) -> Image.Image:
    return Image.open(root / hero / action / f"frame_{index + 1:02d}.png").convert("RGBA")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("original_heroes", type=Path)
    parser.add_argument("replacement_root", type=Path)
    parser.add_argument("target_heroes", type=Path)
    parser.add_argument("provenance_json", type=Path)
    args = parser.parse_args()
    provenance: dict[str, object] = {"policy": "supplied pixels only; no generated artwork", "animations": {}}

    for hero, actions in RECIPES.items():
        hero_provenance: dict[str, object] = {}
        for action, recipe in actions.items():
            frames: list[Image.Image] = []
            frame_sources: list[str] = []
            for source, source_action, index in recipe:
                if source == "original":
                    frame = original_frame(args.original_heroes, hero, source_action, index)
                    source_name = f"original/{hero}/{source_action}/S.png#{index + 1}"
                else:
                    frame = replacement_frame(args.replacement_root, hero, source_action, index)
                    source_name = f"clipping_fixed_v2/{hero}/{source_action}/frame_{index + 1:02d}.png"
                if frame.size != (FRAME_SIZE, FRAME_SIZE):
                    raise ValueError(f"Unexpected frame size for {source_name}: {frame.size}")
                frames.append(frame)
                frame_sources.append(source_name)

            sheet = Image.new("RGBA", (FRAME_SIZE * len(frames), FRAME_SIZE), (0, 0, 0, 0))
            for index, frame in enumerate(frames):
                sheet.paste(frame, (index * FRAME_SIZE, 0), frame)
            destination_dir = args.target_heroes / hero / action
            destination_dir.mkdir(parents=True, exist_ok=True)
            south_path = destination_dir / "S.png"
            sheet.save(south_path, optimize=True)
            for direction in DIRECTIONS:
                if direction == "S":
                    continue
                shutil.copyfile(south_path, destination_dir / f"{direction}.png")
            hero_provenance[action] = frame_sources
        provenance["animations"][hero] = hero_provenance

    args.provenance_json.parent.mkdir(parents=True, exist_ok=True)
    args.provenance_json.write_text(json.dumps(provenance, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()

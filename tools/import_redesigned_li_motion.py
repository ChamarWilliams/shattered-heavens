from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

from PIL import Image


FRAME_SIZE = 384
DIRECTIONS = ("N", "NE", "E", "SE", "S", "SW", "W", "NW")


def opaque_bounds(image: Image.Image) -> tuple[int, int, int, int]:
    bounds = image.getchannel("A").point(lambda value: 255 if value > 16 else 0).getbbox()
    if bounds is None:
        raise ValueError("Frame has no pixels above the alpha threshold")
    return bounds


def opaque_foot_center(image: Image.Image, bottom: int) -> float:
    alpha = image.getchannel("A")
    xs = [
        x
        for y in range(max(0, bottom - 8), bottom + 1)
        for x in range(image.width)
        if alpha.getpixel((x, y)) > 16
    ]
    return sum(xs) / len(xs)


def split_and_normalize(source_path: Path, frame_count: int, target_height: int, lock_feet: bool) -> tuple[Image.Image, list[dict[str, object]]]:
    source = Image.open(source_path).convert("RGBA")
    if source.width % frame_count:
        raise ValueError(f"{source_path} width {source.width} is not divisible by {frame_count}")
    cell_width = source.width // frame_count
    cropped: list[Image.Image] = []
    source_bounds: list[list[int]] = []
    for index in range(frame_count):
        cell = source.crop((index * cell_width, 0, (index + 1) * cell_width, source.height))
        bounds = opaque_bounds(cell)
        cropped.append(cell.crop(bounds))
        source_bounds.append(list(bounds))

    common_scale = target_height / max(frame.height for frame in cropped)
    normalized_frames: list[Image.Image] = []
    frames: list[dict[str, object]] = []
    for index, frame in enumerate(cropped):
        width = max(1, round(frame.width * common_scale))
        height = max(1, round(frame.height * common_scale))
        normalized = frame.resize((width, height), Image.Resampling.NEAREST)
        left, top, right, bottom = opaque_bounds(normalized)
        foot_center = opaque_foot_center(normalized, bottom - 1)
        x = round(192 - foot_center) if lock_feet else round(192 - (left + right) / 2)
        y = 320 - (bottom - 1)
        canvas = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
        canvas.alpha_composite(normalized, (x, y))
        normalized_frames.append(canvas)
        frames.append({
            "frame": index + 1,
            "sourceBounds": source_bounds[index],
            "outputBounds": list(opaque_bounds(canvas)),
        })

    if lock_feet:
        locked_band = normalized_frames[0].crop((0, 292, FRAME_SIZE, 321))
        for frame in normalized_frames[1:]:
            frame.paste((0, 0, 0, 0), (0, 292, FRAME_SIZE, 321))
            frame.alpha_composite(locked_band, (0, 292))

    strip = Image.new("RGBA", (FRAME_SIZE * frame_count, FRAME_SIZE), (0, 0, 0, 0))
    for index, frame in enumerate(normalized_frames):
        strip.alpha_composite(frame, (index * FRAME_SIZE, 0))
    return strip, frames


def write_action(strip: Image.Image, target_root: Path, action: str) -> None:
    target = target_root / "li_yunfeng" / action
    target.mkdir(parents=True, exist_ok=True)
    south = target / "S.png"
    strip.save(south, optimize=True)
    for direction in DIRECTIONS:
        if direction != "S":
            shutil.copyfile(south, target / f"{direction}.png")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source_root", type=Path)
    parser.add_argument("target_heroes", type=Path)
    parser.add_argument("provenance_json", type=Path)
    args = parser.parse_args()

    idle, idle_frames = split_and_normalize(args.source_root / "idle-v2-generated.png", 4, 166, lock_feet=True)
    move, move_frames = split_and_normalize(args.source_root / "move-v2-generated.png", 6, 166, lock_feet=False)
    write_action(idle, args.target_heroes, "idle")
    write_action(move, args.target_heroes, "move")

    provenance = {
        "policy": "User-approved generated replacement artwork; identity-preserving edit of supplied Li Yunfeng strips",
        "engineFrameSize": [FRAME_SIZE, FRAME_SIZE],
        "groundY": 320,
        "animations": {
            "idle": {"source": "idle-v2-generated.png", "frames": idle_frames},
            "move": {"source": "move-v2-generated.png", "frames": move_frames},
        },
    }
    args.provenance_json.parent.mkdir(parents=True, exist_ok=True)
    args.provenance_json.write_text(json.dumps(provenance, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()

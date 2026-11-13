from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage


FRAME_SIZE = 384
FRAME_COUNT = 8
TARGET_HEIGHT = 184
GROUND_Y = 320
SOURCE_ROW_ORDER = ("S", "SE", "E", "NE", "N", "NW", "W", "SW")


def extract_connected_frames(atlas_path: Path) -> dict[str, list[Image.Image]]:
    atlas = Image.open(atlas_path).convert("RGBA")
    rgba = np.asarray(atlas)
    labels, count = ndimage.label(rgba[:, :, 3] > 16, structure=np.ones((3, 3), dtype=np.uint8))
    components: list[tuple[int, int, int, int, int, int]] = []
    for label_id, slices in enumerate(ndimage.find_objects(labels), start=1):
        if slices is None:
            continue
        ys, xs = slices
        area = int(np.count_nonzero(labels[slices] == label_id))
        if area > 100:
            components.append((label_id, area, xs.start, ys.start, xs.stop, ys.stop))

    if len(components) != FRAME_COUNT * len(SOURCE_ROW_ORDER):
        raise ValueError(
            f"{atlas_path} has {len(components)} large connected sprites; expected 64 "
            f"({count} total alpha components)"
        )

    components.sort(key=lambda item: ((item[3] + item[5]) / 2, (item[2] + item[4]) / 2))
    rows: dict[str, list[Image.Image]] = {}
    for row_index, direction in enumerate(SOURCE_ROW_ORDER):
        row = components[row_index * FRAME_COUNT:(row_index + 1) * FRAME_COUNT]
        row.sort(key=lambda item: (item[2] + item[4]) / 2)
        frames: list[Image.Image] = []
        for label_id, _area, left, top, right, bottom in row:
            crop = rgba[top:bottom, left:right].copy()
            crop_labels = labels[top:bottom, left:right]
            crop[crop_labels != label_id] = 0
            frames.append(Image.fromarray(crop, mode="RGBA"))
        rows[direction] = frames
    return rows


def normalize_frame(source: Image.Image) -> Image.Image:
    bounds = source.getchannel("A").getbbox()
    if bounds is None:
        raise ValueError("Movement frame has no visible pixels")
    source = source.crop(bounds)
    scale = TARGET_HEIGHT / source.height
    resized = source.resize(
        (max(1, round(source.width * scale)), TARGET_HEIGHT),
        Image.Resampling.LANCZOS,
    )
    alpha = np.asarray(resized.getchannel("A"))
    ys, xs = np.where(alpha > 16)
    if not len(xs):
        raise ValueError("Movement frame became empty after resizing")
    center_x = float(np.median(xs))
    bottom = int(ys.max())
    x = round(FRAME_SIZE / 2 - center_x)
    y = GROUND_Y - bottom
    canvas = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
    canvas.alpha_composite(resized, (x, y))
    return canvas


def write_runtime_strips(
    atlas_path: Path,
    target_heroes: Path,
    hero_id: str,
) -> dict[str, list[dict[str, float | int]]]:
    rows = extract_connected_frames(atlas_path)
    anchors: dict[str, list[dict[str, float | int]]] = {}
    for direction, source_frames in rows.items():
        frames = [normalize_frame(frame) for frame in source_frames]
        strip = Image.new("RGBA", (FRAME_SIZE * FRAME_COUNT, FRAME_SIZE), (0, 0, 0, 0))
        direction_anchors: list[dict[str, float | int]] = []
        for index, frame in enumerate(frames):
            strip.alpha_composite(frame, (index * FRAME_SIZE, 0))
            bounds = frame.getchannel("A").getbbox()
            if bounds is None:
                raise ValueError(f"Empty normalized frame {hero_id}/{direction}/{index}")
            left, _top, right, bottom = bounds
            if left <= 0 or right >= FRAME_SIZE or bottom >= FRAME_SIZE:
                raise ValueError(f"Clipped normalized frame {hero_id}/{direction}/{index}: {bounds}")
            direction_anchors.append({
                "x": round((left + right) / 2 - FRAME_SIZE / 2, 2),
                "y": round(bottom - FRAME_SIZE * 0.75, 2),
                "width": right - left,
            })
        output = target_heroes / hero_id / "move" / f"{direction}.png"
        output.parent.mkdir(parents=True, exist_ok=True)
        strip.save(output, optimize=True)
        anchors[direction] = direction_anchors
    return anchors


def update_manifest(path: Path, anchors_by_hero: dict[str, dict[str, list[dict[str, float | int]]]]) -> None:
    manifest = json.loads(path.read_text(encoding="utf-8"))
    manifest["version"] = "0.7"
    manifest["status"] = "movement v7: explicit alternating-foot locomotion and clip-safe connected-component import"
    for hero_id, direction_anchors in anchors_by_hero.items():
        move = manifest["heroes"][hero_id]["move"]
        move["frames"] = FRAME_COUNT
        for direction, definition in move["directions"].items():
            definition["frameCount"] = FRAME_COUNT
            definition["authenticDirectionalArtwork"] = True
            definition["source"] = "Movement v7 bespoke alternating-foot atlas"
            definition["reviewRequired"] = False
            definition["shadowAnchors"] = direction_anchors[direction]
    path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    root = args.project_root.resolve()
    source = root / "artifacts" / "movement-v7" / "source"
    target_heroes = root / "public" / "assets" / "gameplay-kit" / "assets" / "heroes"
    anchors = {
        "seo_jiwon": write_runtime_strips(source / "seo-walk-atlas.png", target_heroes, "seo_jiwon"),
        "tsukishiro_rei": write_runtime_strips(source / "rei-walk-atlas.png", target_heroes, "tsukishiro_rei"),
    }
    for manifest in (
        root / "public" / "assets" / "gameplay-kit" / "manifest.json",
        root / "src" / "assets" / "gameplay-manifest.json",
    ):
        update_manifest(manifest, anchors)
    provenance = {
        "policy": "User-approved replacement of Seo Jiwon and Tsukishiro Rei movement frames",
        "sourceRowOrder": list(SOURCE_ROW_ORDER),
        "frameCount": FRAME_COUNT,
        "frameSize": [FRAME_SIZE, FRAME_SIZE],
        "targetHeight": TARGET_HEIGHT,
        "import": "64 largest connected alpha components; isolated, normalized, ground-anchored, then repacked",
        "sourceFiles": ["source/seo-walk-atlas.png", "source/rei-walk-atlas.png"],
    }
    (root / "artifacts" / "movement-v7" / "provenance.json").write_text(
        json.dumps(provenance, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image

from import_bespoke_heroes_v4 import (
    DIRECTIONS,
    SOURCE_INDEX_BY_DIRECTION,
    anchored_scale,
    split_equal_columns,
    translated,
    write_strip,
)
from import_li_premium_v3 import keep_primary_component


FRAME_SIZE = 384
FRAME_ORIGIN_Y = FRAME_SIZE * 0.75


def place_normalized_pose(source: Image.Image, target_height: int = 172) -> Image.Image:
    source = source.convert("RGBA")
    bounds = source.getchannel("A").getbbox()
    if bounds is None:
        raise ValueError("Movement pose has no opaque pixels")
    source = source.crop(bounds)
    scale = target_height / source.height
    resized = source.resize((max(1, round(source.width * scale)), target_height), Image.Resampling.NEAREST)
    array = np.asarray(resized)
    ys, xs = np.where(array[:, :, 3] > 16)
    center_x = float(np.median(xs))
    bottom = int(ys.max())
    canvas = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
    canvas.alpha_composite(resized, (round(FRAME_SIZE / 2 - center_x), 320 - bottom))
    return canvas


def repack_vfx_by_valleys(source_path: Path, frame_count: int, cell_width: int, cell_height: int) -> Image.Image:
    source = Image.open(source_path).convert("RGBA")
    alpha = np.asarray(source)[:, :, 3]
    column_weight = (alpha > 16).sum(axis=0)
    nominal = source.width / frame_count
    boundaries = [0]
    for index in range(1, frame_count):
        center = round(index * nominal)
        radius = round(nominal * 0.24)
        left = max(boundaries[-1] + 24, center - radius)
        right = min(source.width - 24, center + radius)
        scores = []
        for x in range(left, right):
            window = column_weight[max(0, x - 3): min(source.width, x + 4)]
            scores.append((int(window.sum()), abs(x - center), x))
        boundaries.append(min(scores)[2])
    boundaries.append(source.width)
    frames: list[Image.Image] = []
    for index in range(frame_count):
        frame = source.crop((boundaries[index], 0, boundaries[index + 1], source.height))
        frame = keep_primary_component(frame)
        bounds = frame.getchannel("A").getbbox()
        if bounds is None:
            raise ValueError(f"VFX frame {index} in {source_path} is empty")
        frames.append(frame.crop(bounds))
    common_scale = min(
        (cell_width - 20) / max(frame.width for frame in frames),
        (cell_height - 20) / max(frame.height for frame in frames),
    )
    strip = Image.new("RGBA", (cell_width * frame_count, cell_height), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        size = (max(1, round(frame.width * common_scale)), max(1, round(frame.height * common_scale)))
        resized = frame.resize(size, Image.Resampling.LANCZOS)
        strip.alpha_composite(resized, (index * cell_width + (cell_width - resized.width) // 2, (cell_height - resized.height) // 2))
    return strip


def rebuild_movement(base_source: Path, polish_source: Path, target_heroes: Path, hero_id: str, prefix: str) -> dict[str, object]:
    idle = split_equal_columns(base_source / f"{prefix}-idle.png", 8)
    source_sets = {
        "contact_a": split_equal_columns(base_source / f"{prefix}-move-contact-a.png", 8),
        "contact_b": split_equal_columns(base_source / f"{prefix}-move-contact-b.png", 8),
        "down": split_equal_columns(polish_source / f"{prefix}-move-down.png", 8),
        "passing": split_equal_columns(polish_source / f"{prefix}-move-passing.png", 8),
    }
    common_scale = 184 / max(frame.height for frame in idle)
    placed = {name: [place_normalized_pose(frame) for frame in frames] for name, frames in source_sets.items()}
    for direction in DIRECTIONS:
        index = SOURCE_INDEX_BY_DIRECTION[direction]
        contact_a = placed["contact_a"][index]
        contact_b = placed["contact_b"][index]
        down = placed["down"][index]
        passing = placed["passing"][index]
        frames = [
            contact_a,
            down,
            passing,
            translated(contact_b, 0, -3),
            contact_b,
            anchored_scale(down, 0.985),
            translated(passing, 0, -1),
            translated(contact_a, 0, -3),
        ]
        write_strip(target_heroes, hero_id, "move", direction, frames)
    return {"hero": hero_id, "frames": 8, "commonScale": common_scale, "sourcePhases": ["contact_a", "down", "passing", "contact_b"]}


def add_shadow_anchors(manifest: dict[str, object], root: Path) -> None:
    width = int(manifest["frameWidth"])
    height = int(manifest["frameHeight"])
    for animations in manifest["heroes"].values():
        for action in animations.values():
            for definition in action["directions"].values():
                image = Image.open(root / definition["file"]).convert("RGBA")
                anchors = []
                for index in range(definition["frameCount"]):
                    frame = image.crop((index * width, 0, (index + 1) * width, height))
                    bounds = frame.getchannel("A").getbbox()
                    if bounds is None:
                        anchors.append({"x": 0, "y": 32, "width": 40})
                        continue
                    left, _top, right, bottom = bounds
                    anchors.append({
                        "x": round((left + right) / 2 - width / 2, 2),
                        "y": round(bottom - FRAME_ORIGIN_Y, 2),
                        "width": right - left,
                    })
                definition["shadowAnchors"] = anchors


def update_manifests(paths: list[Path], asset_root: Path) -> None:
    effect_updates = {
        "seo_void_shear": {"path": "assets/vfx/seo_void_shear.png", "width": 224, "height": 192, "frames": 6, "fps": 24, "loop": False},
        "seo_void_shear_impact": {"path": "assets/vfx/seo_void_shear_impact.png", "width": 192, "height": 192, "frames": 6, "fps": 22, "loop": False},
        "seo_nightfold_trail": {"path": "assets/vfx/seo_nightfold_trail.png", "width": 224, "height": 128, "frames": 6, "fps": 22, "loop": False},
        "seo_nightfold_fold": {"path": "assets/vfx/seo_nightfold_fold.png", "width": 192, "height": 192, "frames": 6, "fps": 22, "loop": False},
    }
    for path in paths:
        manifest = json.loads(path.read_text(encoding="utf-8"))
        manifest["version"] = "0.5"
        manifest["status"] = "polish v5: four-phase hero locomotion, anchored shadows, stable directional familiar, bespoke Seo combat VFX"
        for hero_id in ("seo_jiwon", "tsukishiro_rei"):
            move = manifest["heroes"][hero_id]["move"]
            move["frames"] = 8
            for definition in move["directions"].values():
                definition["frameCount"] = 8
                definition["source"] = "Polish v5 four-phase bespoke locomotion"
        for obsolete in ("shadow_dash_trail", "shadow_dash_impact", "seo_shadow_echo_rupture"):
            manifest["effects"].pop(obsolete, None)
        manifest["effects"].update(effect_updates)
        add_shadow_anchors(manifest, asset_root)
        path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("base_source", type=Path)
    parser.add_argument("polish_source", type=Path)
    parser.add_argument("target_heroes", type=Path)
    parser.add_argument("target_vfx", type=Path)
    parser.add_argument("asset_root", type=Path)
    parser.add_argument("public_manifest", type=Path)
    parser.add_argument("source_manifest", type=Path)
    parser.add_argument("provenance_json", type=Path)
    args = parser.parse_args()

    provenance = {
        "policy": "User-requested corrective polish; original character designs preserved",
        "movement": [
            rebuild_movement(args.base_source, args.polish_source, args.target_heroes, "seo_jiwon", "seo"),
            rebuild_movement(args.base_source, args.polish_source, args.target_heroes, "tsukishiro_rei", "rei"),
        ],
        "shadowAnchors": "Per engine frame, generated from opaque visual bounds and consumed at runtime",
        "sourceFiles": sorted(path.name for path in args.polish_source.glob("*.png")),
    }
    args.target_vfx.mkdir(parents=True, exist_ok=True)
    specs = {
        "seo_void_shear.png": ("seo-void-shear.png", 6, 224, 192),
        "seo_void_shear_impact.png": ("seo-void-shear-impact.png", 6, 192, 192),
        "seo_nightfold_trail.png": ("seo-nightfold-trail.png", 6, 224, 128),
        "seo_nightfold_fold.png": ("seo-nightfold-fold.png", 6, 192, 192),
    }
    for output_name, (source_name, count, width, height) in specs.items():
        repack_vfx_by_valleys(args.polish_source / source_name, count, width, height).save(args.target_vfx / output_name, optimize=True)

    update_manifests([args.public_manifest, args.source_manifest], args.asset_root)
    args.provenance_json.parent.mkdir(parents=True, exist_ok=True)
    args.provenance_json.write_text(json.dumps(provenance, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

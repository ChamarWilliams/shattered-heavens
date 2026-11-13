from __future__ import annotations

import argparse
import json
from pathlib import Path
from statistics import median

import numpy as np
from PIL import Image
from scipy import ndimage


FRAME_SIZE = 384
DIRECTIONS = ("N", "NE", "E", "SE", "S", "SW", "W", "NW")


def clean_alpha(image: Image.Image, threshold: int = 16) -> Image.Image:
    image = image.convert("RGBA")
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha <= threshold:
                pixels[x, y] = (red, green, blue, 0)
    return image


def opaque_bounds(image: Image.Image) -> tuple[int, int, int, int]:
    bounds = image.getchannel("A").getbbox()
    if bounds is None:
        raise ValueError("Image contains no opaque pixels")
    return bounds


def split_equal_columns(path: Path, count: int) -> list[Image.Image]:
    source = clean_alpha(Image.open(path))
    source_array = np.asarray(source)
    mask = source_array[:, :, 3] > 16
    labels, label_count = ndimage.label(mask, structure=np.ones((3, 3), dtype=np.uint8))
    assigned = [np.zeros_like(source_array) for _ in range(count)]
    cell_width = source.width / count
    for label_id in range(1, label_count + 1):
        ys, xs = np.where(labels == label_id)
        if len(xs) < 4:
            continue
        # A sword or ponytail can legitimately extend beyond one nominal cell.
        # Keep those connected silhouettes intact; split only components wide
        # enough to contain two neighboring characters that touched in the
        # generated source board.
        if xs.max() - xs.min() > cell_width * 1.65:
            indices = np.clip((xs / cell_width).astype(int), 0, count - 1)
            for index in np.unique(indices):
                selected = indices == index
                assigned[int(index)][ys[selected], xs[selected]] = source_array[ys[selected], xs[selected]]
        else:
            component_center = float(xs.mean())
            index = min(count - 1, max(0, int(component_center / cell_width)))
            assigned[index][ys, xs] = source_array[ys, xs]

    frames: list[Image.Image] = []
    for index, frame_array in enumerate(assigned):
        frame = Image.fromarray(frame_array, "RGBA")
        try:
            frames.append(frame.crop(opaque_bounds(frame)))
        except ValueError as error:
            raise ValueError(f"Direction {DIRECTIONS[index]} in {path} is empty") from error
    return frames


def body_anchor(image: Image.Image) -> tuple[float, int]:
    alpha = image.getchannel("A")
    points = [(x, y) for y in range(image.height) for x in range(image.width) if alpha.getpixel((x, y)) > 16]
    center_x = float(median(x for x, _ in points))
    row_counts = [sum(1 for x in range(image.width) if alpha.getpixel((x, y)) > 16) for y in range(image.height)]
    ground_candidates = [y for y, count in enumerate(row_counts) if count >= 18]
    ground_y = max(ground_candidates) if ground_candidates else max(y for _, y in points)
    return center_x, ground_y


def keep_primary_component(image: Image.Image) -> Image.Image:
    array = np.asarray(image).copy()
    labels, label_count = ndimage.label(array[:, :, 3] > 16, structure=np.ones((3, 3), dtype=np.uint8))
    if label_count <= 1:
        return image
    areas = ndimage.sum(np.ones(labels.shape, dtype=np.uint8), labels, range(1, label_count + 1))
    primary_label = int(np.argmax(areas)) + 1
    primary = labels == primary_label
    nearby = ndimage.binary_dilation(primary, iterations=5)
    keep = primary.copy()
    for label_id in range(1, label_count + 1):
        component = labels == label_id
        if np.any(component & nearby):
            keep |= component
    array[~keep] = 0
    return Image.fromarray(array, "RGBA")


def place_character(source: Image.Image, scale: float) -> Image.Image:
    width = max(1, round(source.width * scale))
    height = max(1, round(source.height * scale))
    resized = source.resize((width, height), Image.Resampling.NEAREST)
    center_x, ground_y = body_anchor(resized)
    x = round(FRAME_SIZE / 2 - center_x)
    y = 320 - ground_y
    canvas = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
    canvas.alpha_composite(resized, (x, y))
    return keep_primary_component(canvas)


def anchored_scale(frame: Image.Image, scale_y: float, lift: int = 0) -> Image.Image:
    bounds = opaque_bounds(frame)
    content = frame.crop(bounds)
    height = max(1, round(content.height * scale_y))
    resized = content.resize((content.width, height), Image.Resampling.NEAREST)
    canvas = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    x = round(FRAME_SIZE / 2 - resized.width / 2)
    y = 320 - resized.height - lift
    canvas.alpha_composite(resized, (x, y))
    return canvas


def translated(frame: Image.Image, dx: int, dy: int = 0) -> Image.Image:
    canvas = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    canvas.alpha_composite(frame, (dx, dy))
    return canvas


def direction_vector(direction: str) -> tuple[int, int]:
    return {
        "N": (0, -1), "NE": (1, -1), "E": (1, 0), "SE": (1, 1),
        "S": (0, 1), "SW": (-1, 1), "W": (-1, 0), "NW": (-1, -1),
    }[direction]


def write_strip(target_root: Path, action: str, direction: str, frames: list[Image.Image]) -> None:
    strip = Image.new("RGBA", (FRAME_SIZE * len(frames), FRAME_SIZE), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        strip.alpha_composite(frame, (index * FRAME_SIZE, 0))
    destination = target_root / "li_yunfeng" / action
    destination.mkdir(parents=True, exist_ok=True)
    strip.save(destination / f"{direction}.png", optimize=True)


def horizontal_groups(image: Image.Image) -> list[tuple[int, int]]:
    alpha = image.getchannel("A")
    occupied = [any(alpha.getpixel((x, y)) > 16 for y in range(image.height)) for x in range(image.width)]
    groups: list[tuple[int, int]] = []
    start: int | None = None
    for x, active in enumerate(occupied + [False]):
        if active and start is None:
            start = x
        elif not active and start is not None:
            if x - start > 20:
                groups.append((start, x))
            start = None
    return groups


def repack_vfx(source_path: Path, frame_count: int, cell_width: int, cell_height: int) -> Image.Image:
    source = clean_alpha(Image.open(source_path))
    groups = horizontal_groups(source)
    if len(groups) != frame_count:
        raise ValueError(f"Expected {frame_count} VFX groups in {source_path}, found {len(groups)}: {groups}")
    frames: list[Image.Image] = []
    for left, right in groups:
        group = source.crop((left, 0, right, source.height))
        frames.append(group.crop(opaque_bounds(group)))
    common_scale = min(
        (cell_width - 8) / max(frame.width for frame in frames),
        (cell_height - 8) / max(frame.height for frame in frames),
    )
    strip = Image.new("RGBA", (cell_width * frame_count, cell_height), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        size = (max(1, round(frame.width * common_scale)), max(1, round(frame.height * common_scale)))
        resized = frame.resize(size, Image.Resampling.LANCZOS)
        x = index * cell_width + (cell_width - resized.width) // 2
        y = (cell_height - resized.height) // 2
        strip.alpha_composite(resized, (x, y))
    return strip


def update_manifests(paths: list[Path]) -> None:
    effect_updates = {
        "flying_sword": {"path": "assets/vfx/flying_sword.png", "width": 96, "height": 64, "frames": 4, "fps": 12, "loop": True},
        "flying_sword_trail": {"path": "assets/vfx/flying_sword_trail.png", "width": 128, "height": 64, "frames": 4, "fps": 14, "loop": True},
        "flying_sword_summon": {"path": "assets/vfx/flying_sword_summon.png", "width": 160, "height": 160, "frames": 6, "fps": 18, "loop": False},
        "flying_sword_impact": {"path": "assets/vfx/flying_sword_impact.png", "width": 160, "height": 160, "frames": 6, "fps": 20, "loop": False},
        "sectless_slash": {"path": "assets/vfx/sectless_slash.png", "width": 160, "height": 160, "frames": 5, "fps": 22, "loop": False},
    }
    for path in paths:
        manifest = json.loads(path.read_text(encoding="utf-8"))
        manifest["status"] = "prototype assets; Li Yunfeng premium bespoke 8-direction v3; Seo/Rei directional fallbacks"
        for action in manifest["heroes"]["li_yunfeng"].values():
            for definition in action["directions"].values():
                definition["authenticDirectionalArtwork"] = True
                definition["source"] = "Li Yunfeng premium bespoke 8-direction v3"
                definition["reviewRequired"] = False
        manifest["effects"].update(effect_updates)
        path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source_root", type=Path)
    parser.add_argument("target_heroes", type=Path)
    parser.add_argument("target_vfx", type=Path)
    parser.add_argument("public_manifest", type=Path)
    parser.add_argument("source_manifest", type=Path)
    parser.add_argument("provenance_json", type=Path)
    args = parser.parse_args()

    source_sets = {
        "idle": split_equal_columns(args.source_root / "idle-turnaround.png", 8),
        "move_a": split_equal_columns(args.source_root / "move-contact-a.png", 8),
        "move_b": split_equal_columns(args.source_root / "move-contact-b.png", 8),
        "attack_windup": split_equal_columns(args.source_root / "attack-windup.png", 8),
        "attack_strike": split_equal_columns(args.source_root / "attack-strike-spaced-v2.png", 8),
        "ability_charge": split_equal_columns(args.source_root / "ability-charge.png", 8),
        "ability_release": split_equal_columns(args.source_root / "ability-release.png", 8),
        "hurt": split_equal_columns(args.source_root / "hurt.png", 8),
        "death": split_equal_columns(args.source_root / "death.png", 8),
    }
    west_strikes = split_equal_columns(args.source_root / "attack-strike-sw-w-isolated-v2.png", 2)
    strike_height = round(median(frame.height for frame in source_sets["attack_strike"]))
    west_strikes = [
        frame.resize(
            (max(1, round(frame.width * strike_height / frame.height)), strike_height),
            Image.Resampling.NEAREST,
        )
        for frame in west_strikes
    ]
    source_sets["attack_strike"][5] = west_strikes[0]
    source_sets["attack_strike"][6] = west_strikes[1]
    idle_height = max(frame.height for frame in source_sets["idle"])
    common_scale = 184 / idle_height

    placed = {
        name: [place_character(frame, common_scale) for frame in frames]
        for name, frames in source_sets.items()
    }
    provenance: dict[str, object] = {
        "policy": "User-approved bespoke generated artwork",
        "directions": list(DIRECTIONS),
        "engineFrameSize": [FRAME_SIZE, FRAME_SIZE],
        "groundY": 320,
        "sourceFiles": sorted(path.name for path in args.source_root.glob("*.png")),
        "actions": {},
    }

    for index, direction in enumerate(DIRECTIONS):
        dx, dy = direction_vector(direction)
        idle = placed["idle"][index]
        move_a = placed["move_a"][index]
        move_b = placed["move_b"][index]
        windup = placed["attack_windup"][index]
        strike = placed["attack_strike"][index]
        charge = placed["ability_charge"][index]
        release = placed["ability_release"][index]
        hurt = placed["hurt"][index]
        death = placed["death"][index]

        actions = {
            "idle": [idle, anchored_scale(idle, 1.012), idle, anchored_scale(idle, 0.992)],
            "move": [move_a, anchored_scale(move_a, 0.97), translated(move_b, 0, -2), move_b, anchored_scale(move_b, 0.97), translated(move_a, 0, -2)],
            "basic_attack": [idle, windup, strike, translated(strike, dx * 3, dy * 2), windup],
            "active_ability": [idle, charge, anchored_scale(charge, 0.985), charge, release, translated(release, dx * 2, dy), release, idle],
            "hurt": [idle, hurt, anchored_scale(hurt, 0.97)],
            "death": [idle, hurt, anchored_scale(hurt, 0.94), death, death, death],
        }
        for action, frames in actions.items():
            write_strip(args.target_heroes, action, direction, frames)
        provenance["actions"][direction] = {action: len(frames) for action, frames in actions.items()}

    args.target_vfx.mkdir(parents=True, exist_ok=True)
    vfx_specs = {
        "flying_sword.png": ("flying-sword.png", 4, 96, 64),
        "flying_sword_trail.png": ("flying-sword-trail.png", 4, 128, 64),
        "flying_sword_summon.png": ("flying-sword-summon.png", 6, 160, 160),
        "flying_sword_impact.png": ("flying-sword-impact.png", 6, 160, 160),
        "sectless_slash.png": ("sectless-slash.png", 5, 160, 160),
    }
    for output_name, (source_name, count, width, height) in vfx_specs.items():
        repack_vfx(args.source_root / source_name, count, width, height).save(args.target_vfx / output_name, optimize=True)

    update_manifests([args.public_manifest, args.source_manifest])
    args.provenance_json.parent.mkdir(parents=True, exist_ok=True)
    args.provenance_json.write_text(json.dumps(provenance, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()

from __future__ import annotations

import argparse
import json
from pathlib import Path
from statistics import median

from PIL import Image

from import_li_premium_v3 import (
    DIRECTIONS,
    anchored_scale,
    direction_vector,
    place_character,
    split_equal_columns,
    translated,
)


HERO_FRAME_SIZE = 384
FAMILIAR_FRAME_SIZE = 256
HERO_GROUND_Y = 320
FAMILIAR_GROUND_Y = 224
SOURCE_INDEX_BY_DIRECTION = {"N": 4, "NE": 3, "E": 2, "SE": 1, "S": 0, "SW": 7, "W": 6, "NW": 5}


def repack_equal_vfx(source_path: Path, frame_count: int, cell_width: int, cell_height: int) -> Image.Image:
    source = Image.open(source_path).convert("RGBA")
    source_cell_width = source.width / frame_count
    frames: list[Image.Image] = []
    for index in range(frame_count):
        left = round(index * source_cell_width)
        right = round((index + 1) * source_cell_width)
        frame = source.crop((left, 0, right, source.height))
        bounds = frame.getchannel("A").getbbox()
        if bounds is None:
            raise ValueError(f"VFX frame {index} in {source_path} is empty")
        frames.append(frame.crop(bounds))
    common_scale = min(
        (cell_width - 8) / max(frame.width for frame in frames),
        (cell_height - 8) / max(frame.height for frame in frames),
    )
    strip = Image.new("RGBA", (cell_width * frame_count, cell_height), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        size = (max(1, round(frame.width * common_scale)), max(1, round(frame.height * common_scale)))
        resized = frame.resize(size, Image.Resampling.LANCZOS)
        strip.alpha_composite(resized, (index * cell_width + (cell_width - resized.width) // 2, (cell_height - resized.height) // 2))
    return strip


def write_strip(target_root: Path, hero_id: str, action: str, direction: str, frames: list[Image.Image]) -> None:
    strip = Image.new("RGBA", (HERO_FRAME_SIZE * len(frames), HERO_FRAME_SIZE), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        strip.alpha_composite(frame, (index * HERO_FRAME_SIZE, 0))
    destination = target_root / hero_id / action
    destination.mkdir(parents=True, exist_ok=True)
    strip.save(destination / f"{direction}.png", optimize=True)


def import_hero(source_root: Path, target_root: Path, hero_id: str, prefix: str) -> dict[str, object]:
    source_sets = {
        "idle": split_equal_columns(source_root / f"{prefix}-idle.png", 8),
        "move_a": split_equal_columns(source_root / f"{prefix}-move-contact-a.png", 8),
        "move_b": split_equal_columns(source_root / f"{prefix}-move-contact-b.png", 8),
        "attack_windup": split_equal_columns(source_root / f"{prefix}-attack-windup.png", 8),
        "attack_strike": split_equal_columns(source_root / f"{prefix}-attack-strike.png", 8),
        "ability_charge": split_equal_columns(source_root / f"{prefix}-ability-charge.png", 8),
        "ability_release": split_equal_columns(source_root / f"{prefix}-ability-release.png", 8),
        "hurt": split_equal_columns(source_root / f"{prefix}-hurt.png", 8),
        "death": split_equal_columns(source_root / f"{prefix}-death.png", 8),
    }
    idle_height = max(frame.height for frame in source_sets["idle"])
    common_scale = 184 / idle_height
    placed = {name: [place_character(frame, common_scale) for frame in frames] for name, frames in source_sets.items()}
    action_counts: dict[str, dict[str, int]] = {}

    for direction in DIRECTIONS:
        index = SOURCE_INDEX_BY_DIRECTION[direction]
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
            "idle": [idle, anchored_scale(idle, 1.008), idle, anchored_scale(idle, 0.995)],
            "move": [move_a, anchored_scale(move_a, 0.97), translated(move_b, 0, -2), move_b, anchored_scale(move_b, 0.97), translated(move_a, 0, -2)],
            "basic_attack": [idle, windup, strike, translated(strike, dx * 3, dy * 2), windup],
            "active_ability": [idle, charge, anchored_scale(charge, 0.985), charge, release, translated(release, dx * 2, dy), release, idle],
            "hurt": [idle, hurt, anchored_scale(hurt, 0.97)],
            "death": [idle, hurt, anchored_scale(hurt, 0.94), death, death, death],
        }
        for action, frames in actions.items():
            write_strip(target_root, hero_id, action, direction, frames)
        action_counts[direction] = {action: len(frames) for action, frames in actions.items()}
    return {"scale": common_scale, "actions": action_counts}


def place_familiar(source: Image.Image, scale: float) -> Image.Image:
    width = max(1, round(source.width * scale))
    height = max(1, round(source.height * scale))
    resized = source.resize((width, height), Image.Resampling.NEAREST)
    bounds = resized.getchannel("A").getbbox()
    if bounds is None:
        raise ValueError("Familiar source has no opaque pixels")
    content = resized.crop(bounds)
    canvas = Image.new("RGBA", (FAMILIAR_FRAME_SIZE, FAMILIAR_FRAME_SIZE), (0, 0, 0, 0))
    x = (FAMILIAR_FRAME_SIZE - content.width) // 2
    y = FAMILIAR_GROUND_Y - content.height
    canvas.alpha_composite(content, (x, y))
    return canvas


def familiar_scale(frame: Image.Image, scale_y: float, lift: int = 0) -> Image.Image:
    bounds = frame.getchannel("A").getbbox()
    if bounds is None:
        return frame.copy()
    content = frame.crop(bounds)
    height = max(1, round(content.height * scale_y))
    resized = content.resize((content.width, height), Image.Resampling.NEAREST)
    canvas = Image.new("RGBA", (FAMILIAR_FRAME_SIZE, FAMILIAR_FRAME_SIZE), (0, 0, 0, 0))
    canvas.alpha_composite(resized, ((FAMILIAR_FRAME_SIZE - resized.width) // 2, FAMILIAR_GROUND_Y - resized.height - lift))
    return canvas


def write_familiar_strip(target_root: Path, state: str, direction: str, frames: list[Image.Image]) -> None:
    strip = Image.new("RGBA", (FAMILIAR_FRAME_SIZE * len(frames), FAMILIAR_FRAME_SIZE), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        strip.alpha_composite(frame, (index * FAMILIAR_FRAME_SIZE, 0))
    destination = target_root / "rei_fire_fox" / state
    destination.mkdir(parents=True, exist_ok=True)
    strip.save(destination / f"{direction}.png", optimize=True)


def import_familiar(source_root: Path, target_root: Path) -> dict[str, object]:
    source_sets = {
        "idle": split_equal_columns(source_root / "fox-idle-turnaround.png", 8),
        "move": split_equal_columns(source_root / "fox-move-turnaround.png", 8),
        "attack": split_equal_columns(source_root / "fox-attack-turnaround.png", 8),
    }
    idle_height = max(frame.height for frame in source_sets["idle"])
    common_scale = 176 / idle_height
    placed = {name: [place_familiar(frame, common_scale) for frame in frames] for name, frames in source_sets.items()}
    for direction in DIRECTIONS:
        index = SOURCE_INDEX_BY_DIRECTION[direction]
        idle = placed["idle"][index]
        move = placed["move"][index]
        attack = placed["attack"][index]
        write_familiar_strip(target_root, "idle", direction, [idle, familiar_scale(idle, 1.01), idle, familiar_scale(idle, 0.99)])
        write_familiar_strip(target_root, "move", direction, [move, familiar_scale(move, 0.96), move, familiar_scale(move, 1.02, 2), move, familiar_scale(move, 0.97)])
        write_familiar_strip(target_root, "attack", direction, [idle, attack, familiar_scale(attack, 1.03, 3), attack])
    return {"scale": common_scale, "directions": list(DIRECTIONS), "states": {"idle": 4, "move": 6, "attack": 4}}


def update_manifests(paths: list[Path]) -> None:
    effect_updates = {
        "seo_shadow_echo_rupture": {"path": "assets/vfx/seo_shadow_echo_rupture.png", "width": 160, "height": 160, "frames": 6, "fps": 20, "loop": False},
        "rei_fire_fox_summon": {"path": "assets/vfx/rei_fire_fox_summon.png", "width": 192, "height": 160, "frames": 6, "fps": 14, "loop": False},
        "rei_foxfire_bolt": {"path": "assets/vfx/rei_foxfire_bolt.png", "width": 128, "height": 80, "frames": 4, "fps": 16, "loop": True},
    }
    familiar_states = {
        "idle": {"frames": 4, "fps": 7, "loop": True},
        "move": {"frames": 6, "fps": 12, "loop": True},
        "attack": {"frames": 4, "fps": 16, "loop": False},
    }
    for path in paths:
        manifest = json.loads(path.read_text(encoding="utf-8"))
        manifest["version"] = "0.4"
        manifest["status"] = "all heroes and Rei fire-spirit fox use bespoke authentic 8-direction v4 artwork"
        manifest["effects"].pop("seo_shadow_echo_phantom", None)
        for hero_id in ("seo_jiwon", "tsukishiro_rei"):
            for action in manifest["heroes"][hero_id].values():
                for definition in action["directions"].values():
                    definition["authenticDirectionalArtwork"] = True
                    definition["source"] = "Bespoke heroes authentic 8-direction v4"
                    definition["reviewRequired"] = False
        manifest["effects"].update(effect_updates)
        manifest["familiars"] = {
            "rei_fire_fox": {
                "frameWidth": FAMILIAR_FRAME_SIZE,
                "frameHeight": FAMILIAR_FRAME_SIZE,
                "states": {
                    state: {
                        **settings,
                        "directions": {direction: {"file": f"assets/familiars/rei_fire_fox/{state}/{direction}.png", "authenticDirectionalArtwork": True} for direction in DIRECTIONS},
                    }
                    for state, settings in familiar_states.items()
                },
            }
        }
        path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source_root", type=Path)
    parser.add_argument("target_heroes", type=Path)
    parser.add_argument("target_familiars", type=Path)
    parser.add_argument("target_vfx", type=Path)
    parser.add_argument("public_manifest", type=Path)
    parser.add_argument("source_manifest", type=Path)
    parser.add_argument("provenance_json", type=Path)
    args = parser.parse_args()

    provenance = {
        "policy": "User-approved bespoke generated artwork",
        "directions": list(DIRECTIONS),
        "heroes": {
            "seo_jiwon": import_hero(args.source_root, args.target_heroes, "seo_jiwon", "seo"),
            "tsukishiro_rei": import_hero(args.source_root, args.target_heroes, "tsukishiro_rei", "rei"),
        },
        "familiar": import_familiar(args.source_root, args.target_familiars),
        "sourceFiles": sorted(path.name for path in args.source_root.glob("*.png")),
    }

    args.target_vfx.mkdir(parents=True, exist_ok=True)
    vfx_specs = {
        "seo_shadow_echo_rupture.png": ("seo-shadow-echo-rupture.png", 6, 160, 160),
        "rei_fire_fox_summon.png": ("rei-fire-fox-anim.png", 6, 192, 160),
        "rei_foxfire_bolt.png": ("rei-foxfire-bolt.png", 4, 128, 80),
    }
    for output_name, (source_name, count, width, height) in vfx_specs.items():
        repack_equal_vfx(args.source_root / source_name, count, width, height).save(args.target_vfx / output_name, optimize=True)

    update_manifests([args.public_manifest, args.source_manifest])
    args.provenance_json.parent.mkdir(parents=True, exist_ok=True)
    args.provenance_json.write_text(json.dumps(provenance, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

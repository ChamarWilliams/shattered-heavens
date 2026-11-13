from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

from import_polish_v5 import repack_vfx_by_valleys


FOX_FRAME_SIZE = 256


def keep_primary_fox(frame: Image.Image) -> Image.Image:
    array = np.asarray(frame.convert("RGBA")).copy()
    labels, count = ndimage.label(array[:, :, 3] > 16, structure=np.ones((3, 3), dtype=np.uint8))
    if count <= 1:
        return frame
    areas = ndimage.sum(np.ones(labels.shape, dtype=np.uint8), labels, range(1, count + 1))
    primary_label = int(np.argmax(areas)) + 1
    keep = labels == primary_label
    array[~keep] = 0
    return Image.fromarray(array, "RGBA")


def clean_fox_attacks(root: Path) -> dict[str, int]:
    removed_by_direction: dict[str, int] = {}
    for path in sorted(root.glob("*.png")):
        source = Image.open(path).convert("RGBA")
        frame_count = source.width // FOX_FRAME_SIZE
        output = Image.new("RGBA", source.size, (0, 0, 0, 0))
        removed = 0
        for index in range(frame_count):
            frame = source.crop((index * FOX_FRAME_SIZE, 0, (index + 1) * FOX_FRAME_SIZE, FOX_FRAME_SIZE))
            before = np.count_nonzero(np.asarray(frame)[:, :, 3] > 16)
            cleaned = keep_primary_fox(frame)
            after = np.count_nonzero(np.asarray(cleaned)[:, :, 3] > 16)
            removed += int(before - after)
            output.alpha_composite(cleaned, (index * FOX_FRAME_SIZE, 0))
        output.save(path, optimize=True)
        removed_by_direction[path.stem] = removed
    return removed_by_direction


def update_manifest(path: Path) -> None:
    manifest = json.loads(path.read_text(encoding="utf-8"))
    manifest["version"] = "0.6"
    manifest["status"] = "hit polish v6: clip-safe fox attack and bespoke Rei/Seo collision impacts"
    manifest["effects"].update({
        "rei_moonfox_hit": {
            "path": "assets/vfx/rei_moonfox_hit.png", "width": 192, "height": 192,
            "frames": 6, "fps": 24, "loop": False,
        },
        "seo_heartbreak_hit": {
            "path": "assets/vfx/seo_heartbreak_hit.png", "width": 192, "height": 192,
            "frames": 6, "fps": 24, "loop": False,
        },
    })
    path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("vfx_target", type=Path)
    parser.add_argument("fox_attack_root", type=Path)
    parser.add_argument("public_manifest", type=Path)
    parser.add_argument("source_manifest", type=Path)
    parser.add_argument("provenance", type=Path)
    args = parser.parse_args()

    args.vfx_target.mkdir(parents=True, exist_ok=True)
    repack_vfx_by_valleys(args.source / "rei-moonfox-bite.png", 6, 192, 192).save(
        args.vfx_target / "rei_moonfox_hit.png", optimize=True,
    )
    repack_vfx_by_valleys(args.source / "seo-heartbreak-rend.png", 6, 192, 192).save(
        args.vfx_target / "seo_heartbreak_hit.png", optimize=True,
    )
    removed = clean_fox_attacks(args.fox_attack_root)
    update_manifest(args.public_manifest)
    update_manifest(args.source_manifest)
    args.provenance.parent.mkdir(parents=True, exist_ok=True)
    args.provenance.write_text(json.dumps({
        "policy": "User-requested bespoke collision VFX and fox attack cleanup",
        "effects": ["rei_moonfox_hit", "seo_heartbreak_hit"],
        "foxAttackRemovedOpaquePixels": removed,
        "foxAttackRenderCompensationPx": 12,
    }, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

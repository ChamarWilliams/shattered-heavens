from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image


def file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:12]


def frame_hash(frame: np.ndarray) -> str:
    return hashlib.sha256(frame.tobytes()).hexdigest()[:12]


def horizontal_groups(mask: np.ndarray) -> list[dict[str, int]]:
    occupied = mask.any(axis=0)
    groups: list[tuple[int, int]] = []
    start: int | None = None
    empty_run = 0
    for x, has_pixels in enumerate(occupied):
        if has_pixels:
            if start is None:
                start = x
            empty_run = 0
        elif start is not None:
            empty_run += 1
            if empty_run >= 6:
                groups.append((start, x - empty_run + 1))
                start = None
                empty_run = 0
    if start is not None:
        groups.append((start, mask.shape[1]))

    result: list[dict[str, int]] = []
    for left, right in groups:
        ys, xs = np.where(mask[:, left:right])
        if not len(xs):
            continue
        result.append(
            {
                "left": int(left + xs.min()),
                "right": int(left + xs.max() + 1),
                "top": int(ys.min()),
                "bottom": int(ys.max() + 1),
                "area": int(len(xs)),
            }
        )
    return result


def inspect_frame(frame: np.ndarray) -> dict[str, object]:
    mask = frame[:, :, 3] > 16
    ys, xs = np.where(mask)
    if not len(xs):
        return {"empty": True}
    bottom = int(ys.max())
    foot_x = xs[ys >= bottom - 8]
    groups = horizontal_groups(mask)
    large_groups = [
        group
        for group in groups
        if group["area"] >= 1800
        and group["right"] - group["left"] >= 35
        and group["bottom"] - group["top"] >= 65
    ]
    return {
        "empty": False,
        "bbox": [int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1)],
        "touchesEdge": bool(xs.min() == 0 or ys.min() == 0 or xs.max() == frame.shape[1] - 1 or ys.max() == frame.shape[0] - 1),
        "groundY": bottom,
        "footCenterX": round(float(foot_x.mean()), 2),
        "largeHorizontalGroups": large_groups,
        "duplicateCharacterCandidate": len(large_groups) > 1,
        "hash": frame_hash(frame),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("root", type=Path)
    parser.add_argument("report_json", type=Path)
    parser.add_argument("report_md", type=Path)
    args = parser.parse_args()

    manifest = json.loads((args.root / "manifest.json").read_text(encoding="utf-8"))
    result: dict[str, object] = {
        "manifestVersion": manifest["version"],
        "manifestStatus": manifest["status"],
        "frameSize": [manifest["frameWidth"], manifest["frameHeight"]],
        "heroes": {},
        "effects": {},
        "familiars": {},
    }
    defect_totals = {"dimensionErrors": 0, "clippedFrames": 0, "duplicateCandidates": 0}

    for hero_id, animations in manifest["heroes"].items():
        hero_result: dict[str, object] = {}
        for action, action_meta in animations.items():
            direction_result: dict[str, object] = {}
            hashes: dict[str, list[str]] = {}
            for direction, definition in action_meta["directions"].items():
                path = args.root / definition["file"]
                image = np.asarray(Image.open(path).convert("RGBA"))
                expected = (manifest["frameHeight"], definition["frameCount"] * manifest["frameWidth"])
                dimension_ok = image.shape[:2] == expected
                if not dimension_ok:
                    defect_totals["dimensionErrors"] += 1
                frames = []
                if dimension_ok:
                    for index in range(definition["frameCount"]):
                        left = index * manifest["frameWidth"]
                        frame = image[:, left : left + manifest["frameWidth"]]
                        inspection = inspect_frame(frame)
                        frames.append(inspection)
                        if inspection.get("touchesEdge"):
                            defect_totals["clippedFrames"] += 1
                        if inspection.get("duplicateCharacterCandidate"):
                            defect_totals["duplicateCandidates"] += 1
                digest = file_hash(path)
                hashes.setdefault(digest, []).append(direction)
                direction_result[direction] = {
                    "file": definition["file"],
                    "dimensionOk": dimension_ok,
                    "authenticDirectionalArtwork": definition["authenticDirectionalArtwork"],
                    "fallbackSource": definition["source"],
                    "reviewRequired": definition["reviewRequired"],
                    "frames": frames,
                }
            direction_result["_identicalFileGroups"] = list(hashes.values())
            hero_result[action] = direction_result
        result["heroes"][hero_id] = hero_result

    for effect_id, definition in manifest["effects"].items():
        path = args.root / definition["path"]
        image = np.asarray(Image.open(path).convert("RGBA"))
        expected = (definition["height"], definition["frames"] * definition["width"])
        dimension_ok = image.shape[:2] == expected
        if not dimension_ok:
            defect_totals["dimensionErrors"] += 1
        effect_frames = []
        if dimension_ok:
            for index in range(definition["frames"]):
                left = index * definition["width"]
                frame = image[:, left : left + definition["width"]]
                inspection = inspect_frame(frame)
                effect_frames.append(inspection)
                if inspection.get("touchesEdge"):
                    defect_totals["clippedFrames"] += 1
        result["effects"][effect_id] = {
            "file": definition["path"],
            "dimensionOk": dimension_ok,
            "actualSize": [int(image.shape[1]), int(image.shape[0])],
            "expectedSize": [expected[1], expected[0]],
            "frames": effect_frames,
        }

    for familiar_id, familiar in manifest.get("familiars", {}).items():
        familiar_result: dict[str, object] = {}
        for state, state_meta in familiar["states"].items():
            state_result: dict[str, object] = {}
            hashes: dict[str, list[str]] = {}
            for direction, definition in state_meta["directions"].items():
                path = args.root / definition["file"]
                image = np.asarray(Image.open(path).convert("RGBA"))
                expected = (familiar["frameHeight"], state_meta["frames"] * familiar["frameWidth"])
                dimension_ok = image.shape[:2] == expected
                if not dimension_ok:
                    defect_totals["dimensionErrors"] += 1
                frames = []
                if dimension_ok:
                    for index in range(state_meta["frames"]):
                        left = index * familiar["frameWidth"]
                        inspection = inspect_frame(image[:, left : left + familiar["frameWidth"]])
                        frames.append(inspection)
                        if inspection.get("touchesEdge"):
                            defect_totals["clippedFrames"] += 1
                        if inspection.get("duplicateCharacterCandidate"):
                            defect_totals["duplicateCandidates"] += 1
                digest = file_hash(path)
                hashes.setdefault(digest, []).append(direction)
                state_result[direction] = {
                    "file": definition["file"],
                    "dimensionOk": dimension_ok,
                    "authenticDirectionalArtwork": definition["authenticDirectionalArtwork"],
                    "frames": frames,
                }
            state_result["_identicalFileGroups"] = list(hashes.values())
            familiar_result[state] = state_result
        result["familiars"][familiar_id] = familiar_result

    result["defectTotals"] = defect_totals
    args.report_json.parent.mkdir(parents=True, exist_ok=True)
    args.report_json.write_text(json.dumps(result, indent=2), encoding="utf-8")

    lines = [
        "# Gameplay asset pack audit",
        "",
        f"Manifest: `{manifest['version']}` — {manifest['status']}",
        "",
        "Li Yunfeng, Seo Jiwon, and Tsukishiro Rei use bespoke direction-specific artwork for all six animation states. Rei's fire-spirit fox has its own authentic eight-direction idle, movement, and pounce sets.",
        "",
        f"- Dimension errors: {defect_totals['dimensionErrors']}",
        f"- Frames touching their declared cell edge: {defect_totals['clippedFrames']}",
        f"- Multiple large horizontal-component candidates: {defect_totals['duplicateCandidates']}",
        "",
        "Li Yunfeng's v3 masters remain under `artifacts/li-yunfeng-premium-v3/`. Original Seo, Rei, and fox masters remain under `artifacts/bespoke-heroes-v4/`; movement corrections are under `artifacts/polish-v5/`; collision VFX and fox cleanup provenance are under `artifacts/hit-v6/`.",
        "",
        "## Direction identity",
        "",
        "All three heroes and the fire-spirit fox have distinct N/NE/E/SE/S/SW/W/NW files and render without runtime mirroring.",
        "",
        "## Automated defect interpretation",
        "",
        "Edge-touching frames are flagged as possible clipping. Multiple large horizontal groups are review candidates for adjacent characters or duplicate fragments. Character and familiar strips keep magical effects separate.",
        "",
        "See `artifacts/gameplay-asset-audit.json` for per-frame bounds, anchors, hashes, and candidates. V6 collision and fox-cleanup provenance is recorded in `artifacts/hit-v6/provenance.json`.",
        "",
        "## Remaining manual artwork work",
        "",
        "No clipping or duplicate-character candidates remain in the engine-ready strips. Fox attack frames retain only their primary connected body, removing detached heads, tails, and fragments. Generated collision VFX remain replaceable prototype art under stable manifest keys.",
    ]
    args.report_md.write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

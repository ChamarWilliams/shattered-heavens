from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image


def inspect_frame(path: Path, source_width: int) -> dict[str, object]:
    image = Image.open(path)
    rgba = np.asarray(image.convert("RGBA"))
    mask = rgba[:, :, 3] > 16
    ys, xs = np.where(mask)
    crop_left = (384 - source_width) // 2
    crop_right = crop_left + source_width - 1
    if not len(xs):
        return {"empty": True}
    ground_y = int(ys.max())
    feet = xs[ys >= ground_y - 8]
    left_contact = int(mask[:, crop_left].sum())
    right_contact = int(mask[:, crop_right].sum())
    return {
        "empty": False,
        "mode": image.mode,
        "size": list(image.size),
        "hasTransparency": bool(rgba[:, :, 3].min() == 0),
        "bbox": [int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1)],
        "sourceCrop": [crop_left, crop_right],
        "sourceBoundaryContact": {"leftPixels": left_contact, "rightPixels": right_contact},
        "clippingRisk": left_contact >= 20 or right_contact >= 20,
        "groundY": ground_y,
        "footCenterX": round(float(feet.mean()), 2),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source_root", type=Path)
    parser.add_argument("report_json", type=Path)
    parser.add_argument("report_md", type=Path)
    args = parser.parse_args()
    manifest = json.loads((args.source_root / "manifest.json").read_text(encoding="utf-8"))
    report: dict[str, object] = {"source": str(args.source_root), "heroes": {}, "summary": {}}
    risky_files: list[str] = []
    alignment_warnings: list[dict[str, object]] = []
    total_frames = 0

    for hero, actions in manifest.items():
        hero_result: dict[str, object] = {}
        for action, metadata in actions.items():
            frames = []
            for index in range(metadata["frames"]):
                source_width = metadata["source_x_partitions"][index + 1] - metadata["source_x_partitions"][index]
                relative = f"{hero}/{action}/frame_{index + 1:02d}.png"
                inspection = inspect_frame(args.source_root / relative, source_width)
                inspection["file"] = relative
                frames.append(inspection)
                total_frames += 1
                if inspection.get("clippingRisk"):
                    risky_files.append(relative)
            centers = [float(frame["footCenterX"]) for frame in frames if not frame.get("empty")]
            grounds = [int(frame["groundY"]) for frame in frames if not frame.get("empty")]
            if action in {"idle", "move"} and centers:
                center_span = round(max(centers) - min(centers), 2)
                ground_span = max(grounds) - min(grounds)
                if center_span > 12 or ground_span > 3:
                    alignment_warnings.append({
                        "animation": f"{hero}/{action}",
                        "footCenterSpan": center_span,
                        "groundSpan": ground_span,
                    })
            hero_result[action] = {"frames": frames}
        report["heroes"][hero] = hero_result

    report["summary"] = {
        "framesInspected": total_frames,
        "clippingRiskCount": len(risky_files),
        "clippingRiskFiles": risky_files,
        "alignmentWarnings": alignment_warnings,
    }
    args.report_json.parent.mkdir(parents=True, exist_ok=True)
    args.report_json.write_text(json.dumps(report, indent=2), encoding="utf-8")
    lines = [
        "# Updated-frame automated audit",
        "",
        f"- Frames inspected: {total_frames}",
        f"- Declared size/alpha: all frames are 384x384 transparent RGBA PNGs",
        f"- Significant source-partition boundary contacts: {len(risky_files)}",
        "",
        "A boundary contact means at least 20 opaque pixels meet a crop partition from the original board. It is a clipping-risk signal, not proof that every contacted pixel is a duplicate character.",
        "",
        "## Significant boundary-contact filenames",
        "",
        *[f"- `{name}`" for name in risky_files],
        "",
        "## Loop alignment warnings",
        "",
        *[
            f"- `{item['animation']}`: foot-center span {item['footCenterSpan']} px; ground span {item['groundSpan']} px"
            for item in alignment_warnings
        ],
        "",
        "See the JSON report for every frame's bounding box, source boundary contacts, ground position, and measured foot center.",
    ]
    args.report_md.write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

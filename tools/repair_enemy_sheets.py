"""Rebuild the dungeon enemy atlases from enemies-animated-v2.png without new artwork.

The v2 atlases were cut from the generated sources on a fixed 4x4 grid, but the
sprites in those sources overflowed their quarters. Every v2 cell therefore holds
its own sprite with a straight cut where it crossed the grid line, plus foreign
fragments of its neighbours (feet of the frame above, tails of the frame to the
right, ...). The Foxfire boss, for example, lost its left tails and paws.

This tool reassembles every sprite from the existing pixels:
  1. split each cell into connected components;
  2. move every edge-touching fragment back to the neighbour it was cut from,
     sliding it along the cut line to the offset where its edge pixels continue
     the owner's edge pixels;
  3. mirror the few frames drawn facing the other way (MIRRORED), so an
     animation never flips left/right on its own;
  4. align all frames of one enemy on its body (frame 0's alpha centroid, then
     best overlap), and write a larger grid so no frame is clipped.

Run:  python tools/repair_enemy_sheets.py   (needs numpy, scipy, Pillow)
Writes public/assets/dungeons/<theme>/enemies-animated-v3.png and the generated
src/game/enemySheetLayout.ts that DungeonRunScene reads.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage, signal

ROOT = Path(__file__).resolve().parents[1]
THEMES = ("sectless-temple", "nightfold-crypt", "foxfire-shrine")
SOURCE_CELL = 192
GRID = 4
OUTPUT_CELL = 256
# Anchor of every frame inside an output cell: the alpha centroid of the sprite.
ANCHOR = (128, 132)
NEIGHBOUR = {"T": (-1, 0), "B": (1, 0), "L": (0, -1), "R": (0, 1)}
OPPOSITE = {"T": "B", "B": "T", "L": "R", "R": "L"}
MIN_CONTINUITY = 0.3
# Frames drawn facing the other way from the rest of their animation (checked by
# eye on the v2 sheets); they are mirrored so an enemy never flips on its own.
MIRRORED = {
    "foxfire-shrine": {(2, 1), (2, 2)},
    "sectless-temple": {(2, 2)},
}
# Enemy columns drawn in profile facing right. Front-facing designs (bosses, the
# orb, the lion) are never mirrored at runtime, or their weapons would swap hands.
SIDE_FACING = {
    "foxfire-shrine": {1, 2},
    "sectless-temple": {0},
}


def cell_components(cell: np.ndarray) -> list[dict]:
    alpha = cell[:, :, 3]
    solid = alpha > 24
    # The grid lines of the original source map to the edges of the cell's content
    # bounds, not to the cell edges: v2 centred narrower content horizontally.
    oy, ox = np.nonzero(alpha > 0)
    top, bottom, left, right = oy.min(), oy.max(), ox.min(), ox.max()
    labels, _ = ndimage.label(ndimage.binary_dilation(solid, iterations=1), structure=np.ones((3, 3)))
    components = []
    for index, slices in enumerate(ndimage.find_objects(labels), start=1):
        if slices is None:
            continue
        mask = (labels == index) & (alpha > 0)
        area = int(np.count_nonzero(mask & solid))
        if area < 15:
            continue
        ys, xs = np.nonzero(mask)
        contact = {
            "T": len(np.unique(xs[ys <= top + 2])),
            "B": len(np.unique(xs[ys >= bottom - 2])),
            "L": len(np.unique(ys[xs <= left + 2])),
            "R": len(np.unique(ys[xs >= right - 2])),
        }
        components.append({"mask": mask, "area": area, "contact": contact})
    components.sort(key=lambda component: -component["area"])
    return components


def boundary(mask: np.ndarray, side: str) -> int:
    ys, xs = np.nonzero(mask)
    return {"T": ys.min(), "B": ys.max(), "L": xs.min(), "R": xs.max()}[side]


def edge_profile(rgba: np.ndarray, mask: np.ndarray, side: str, edge: int, depth: int = 3) -> np.ndarray:
    """RGBA samples of `mask` along the `depth` lines inside `edge` on `side`, as (length, 4)."""
    picked = np.where(mask[:, :, None], rgba, 0).astype(np.float32)
    if side == "T":
        band = picked[edge:edge + depth]
    elif side == "B":
        band = picked[edge - depth + 1:edge + 1]
    elif side == "L":
        band = picked[:, edge:edge + depth].transpose(1, 0, 2)
    else:
        band = picked[:, edge - depth + 1:edge + 1].transpose(1, 0, 2)
    return band.max(axis=0)


def best_shift(owner: np.ndarray, fragment: np.ndarray, search: int = 48) -> tuple[int, float]:
    """Offset along the cut that best continues the owner's edge pixels with the
    fragment's. Scored over the fragment's span: +colour agreement where both
    sides are opaque, -0.6 where only one is, normalised by the opaque count."""
    present = np.nonzero(fragment[:, 3] > 32)[0]
    if not len(present):
        return 0, -1.0
    span = np.arange(present.min(), present.max() + 1)
    best = (0, -1e9)
    for shift in range(-search, search + 1):
        target = span + shift
        inside = (target >= 0) & (target < len(owner))
        a = np.zeros((len(span), 4), dtype=np.float32)
        a[inside] = owner[target[inside]]
        b = fragment[span]
        sa, sb = a[:, 3] > 32, b[:, 3] > 32
        both = sa & sb
        agreement = (1.0 - np.minimum(1.0, np.abs(a[both, :3] - b[both, :3]).mean(axis=1) / 96.0)).sum()
        score = (agreement - 0.6 * np.count_nonzero(sa ^ sb)) / max(1, np.count_nonzero(sa | sb))
        if score > best[1]:
            best = (shift, float(score))
    return best


def assemble(sheet: np.ndarray) -> tuple[dict, list[str]]:
    cells = {}
    for row in range(GRID):
        for column in range(GRID):
            rgba = sheet[row * SOURCE_CELL:(row + 1) * SOURCE_CELL, column * SOURCE_CELL:(column + 1) * SOURCE_CELL]
            cells[(row, column)] = {"rgba": rgba, "components": cell_components(rgba), "content": rgba[:, :, 3] > 0}

    pad = SOURCE_CELL
    canvases = {}
    for key, cell in cells.items():
        canvas = np.zeros((SOURCE_CELL + 2 * pad, SOURCE_CELL + 2 * pad, 4), dtype=np.uint8)
        canvases[key] = canvas
    owned = {key: [] for key in cells}
    log = []
    # Pixels known to belong to each cell's own sprite. Fragments are matched only
    # against these, so two halves of one cut part cannot swap cells.
    own = {key: np.zeros_like(cell["content"]) for key, cell in cells.items()}
    pending = []
    for (row, column), cell in cells.items():
        for index, component in enumerate(cell["components"]):
            sides = [
                side for side, count in component["contact"].items()
                if count > 0 and 0 <= row + NEIGHBOUR[side][0] < GRID and 0 <= column + NEIGHBOUR[side][1] < GRID
            ]
            if index == 0 or not sides:
                owned[(row, column)].append((component["mask"], cell["rgba"], 0, 0))
                own[(row, column)] |= component["mask"]
            else:
                pending.append(((row, column), component, sides))

    # Largest pieces first: a large part that stays becomes matchable for the
    # smaller pieces cut from it.
    pending.sort(key=lambda item: -item[1]["area"])
    for (row, column), component, sides in pending:
        cell = cells[(row, column)]
        candidates = []
        for side in sides:
            owner_key = (row + NEIGHBOUR[side][0], column + NEIGHBOUR[side][1])
            owner_cell = cells[owner_key]
            owner_side = OPPOSITE[side]
            # The cut runs along each cell's content bounds (the source grid line).
            fragment_profile = edge_profile(cell["rgba"], component["mask"], side, boundary(cell["content"], side))
            owner_profile = edge_profile(owner_cell["rgba"], own[owner_key], owner_side, boundary(owner_cell["content"], owner_side))
            # Small pieces match almost anywhere; only let them slide a little.
            shift, score = best_shift(owner_profile, fragment_profile, 48 if component["area"] >= 150 else 12)
            candidates.append((score, side, owner_key, shift))
        score, side, owner_key, shift = max(candidates)
        if score < MIN_CONTINUITY:
            # Detached parts of the sprite itself (a boss's floating sword) also
            # reach the content bounds; keep those, drop unplaceable specks.
            if component["area"] >= 200:
                owned[(row, column)].append((component["mask"], cell["rgba"], 0, 0))
                own[(row, column)] |= component["mask"]
                log.append(f"  ({row},{column}) kept {component['area']}px part [{side}] (best continuity {score:.2f})")
            else:
                log.append(f"  ({row},{column}) dropped {component['area']}px speck [{side}] (best continuity {score:.2f})")
            continue
        owner_side = OPPOSITE[side]
        # Place the fragment's cut edge one pixel beyond the owner's cut edge.
        owner_edge = boundary(cells[owner_key]["content"], owner_side)
        fragment_edge = boundary(cell["content"], side)
        if side in ("T", "B"):
            dy = owner_edge - fragment_edge + (1 if side == "T" else -1)
            dx = shift
        else:
            dx = owner_edge - fragment_edge + (1 if side == "L" else -1)
            dy = shift
        owned[owner_key].append((component["mask"], cell["rgba"], dy, dx))
        log.append(f"  ({row},{column}) fragment {component['area']:5d}px [{side}] -> ({owner_key[0]},{owner_key[1]}) shift {shift:+d} continuity {score:.2f}")

    for key, parts in owned.items():
        canvas = canvases[key]
        for mask, rgba, dy, dx in parts:
            ys, xs = np.nonzero(mask)
            ty, tx = ys + dy + pad, xs + dx + pad
            existing = canvas[ty, tx]
            incoming = rgba[ys, xs]
            take = incoming[:, 3] >= existing[:, 3]
            canvas[ty[take], tx[take]] = incoming[take]
    return canvases, log


def centroid(alpha: np.ndarray) -> tuple[float, float]:
    weights = alpha.astype(np.float64)
    ys, xs = np.indices(alpha.shape)
    total = weights.sum()
    return float((xs * weights).sum() / total), float((ys * weights).sum() / total)


def overlap_shift(reference: np.ndarray, frame: np.ndarray) -> tuple[int, int]:
    """Translation (dy, dx) of `frame` that best overlaps `reference` (alpha masks).
    The body dominates the overlap, so swinging weapons and VFX do not drag it."""
    a = (reference[:, :, 3] > 64).astype(np.float32)
    b = (frame[:, :, 3] > 64).astype(np.float32)
    correlation = signal.fftconvolve(a, b[::-1, ::-1], mode="full")
    peak_y, peak_x = np.unravel_index(np.argmax(correlation), correlation.shape)
    return int(peak_y - (b.shape[0] - 1)), int(peak_x - (b.shape[1] - 1))


def build(theme: str) -> dict:
    source = ROOT / "public" / "assets" / "dungeons" / theme / "enemies-animated-v2.png"
    sheet = np.asarray(Image.open(source).convert("RGBA"))
    canvases, log = assemble(sheet)
    print(f"{theme}:")
    print("\n".join(log))

    output = Image.new("RGBA", (OUTPUT_CELL * GRID, OUTPUT_CELL * GRID), (0, 0, 0, 0))
    columns = []
    for column in range(GRID):
        frames = []
        for row in range(GRID):
            frame = canvases[(row, column)]
            if (row, column) in MIRRORED.get(theme, ()):
                frame = np.ascontiguousarray(frame[:, ::-1])
            frames.append(frame)
        # Frame 0 is placed by its alpha centroid; the others follow by overlap so
        # the body stays put while limbs and effects animate.
        cx, cy = centroid(frames[0][:, :, 3])
        base = (int(round(ANCHOR[1] - cy)), int(round(ANCHOR[0] - cx)))
        lowest, highest = 0, OUTPUT_CELL
        for row, frame in enumerate(frames):
            dy, dx = overlap_shift(frames[0], frame) if row else (0, 0)
            top, left = base[0] + dy, base[1] + dx
            ys, xs = np.nonzero(frame[:, :, 3] > 0)
            if xs.min() + left < 0 or xs.max() + left >= OUTPUT_CELL or ys.min() + top < 0 or ys.max() + top >= OUTPUT_CELL:
                raise SystemExit(f"{theme} frame ({row},{column}) does not fit a {OUTPUT_CELL}px cell")
            output.alpha_composite(Image.fromarray(frame, "RGBA"), (column * OUTPUT_CELL + left, row * OUTPUT_CELL + top))
            solid_rows = np.nonzero((frame[:, :, 3] > 128).sum(axis=1) >= 3)[0]
            lowest = max(lowest, int(solid_rows.max() + top))
            if row < 3:
                highest = min(highest, int(solid_rows.min() + top))
            print(f"  frame ({row},{column}) mirrored={(row, column) in MIRRORED.get(theme, ())} offset=({dx:+d},{dy:+d})")
        # Ground line for the drop shadow: the lowest solid row of any frame; head
        # line for the health bar: the highest solid row of the idle/move frames.
        columns.append({"footY": lowest, "topY": highest})
    destination = source.with_name("enemies-animated-v3.png")
    output.save(destination, optimize=True)
    print(f"  -> {destination.relative_to(ROOT)}")
    return {"columns": columns}


def write_layout(layout: dict) -> None:
    destination = ROOT / "src" / "game" / "enemySheetLayout.ts"

    def table(key: str) -> str:
        return ",\n".join(
            f"  '{theme}': [{', '.join(str(column[key]) for column in layout[theme]['columns'])}]" for theme in THEMES
        )

    side_facing = ",\n".join(
        f"  '{theme}': [{', '.join('true' if column in SIDE_FACING.get(theme, ()) else 'false' for column in range(GRID))}]"
        for theme in THEMES
    )
    destination.write_text(
        "// Generated by tools/repair_enemy_sheets.py. Do not edit by hand.\n"
        "import type { DungeonThemeId } from '../dungeon';\n\n"
        f"export const ENEMY_SHEET_CELL = {OUTPUT_CELL};\n"
        "/** Pixel in every cell that sits on the enemy's gameplay position. */\n"
        f"export const ENEMY_SHEET_ANCHOR = {{ x: {ANCHOR[0]}, y: {ANCHOR[1]} }} as const;\n"
        "/** Lowest solid row per enemy column, where its feet and drop shadow are. */\n"
        f"export const ENEMY_SHEET_FOOT_Y: Readonly<Record<DungeonThemeId, readonly number[]>> = {{\n{table('footY')},\n}};\n"
        "/** Highest solid row of the idle/move frames per enemy column, for the health bar. */\n"
        f"export const ENEMY_SHEET_TOP_Y: Readonly<Record<DungeonThemeId, readonly number[]>> = {{\n{table('topY')},\n}};\n"
        "/** Columns drawn in profile facing right; they are mirrored to face their target. */\n"
        f"export const ENEMY_SHEET_SIDE_FACING: Readonly<Record<DungeonThemeId, readonly boolean[]>> = {{\n{side_facing},\n}};\n"
    )
    print(f"  -> {destination.relative_to(ROOT)}")


if __name__ == "__main__":
    layout = {theme: build(theme) for theme in THEMES}
    write_layout(layout)

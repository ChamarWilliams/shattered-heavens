import type Phaser from 'phaser';

/**
 * Danger markers. The standard style uses the realm's colour. The accessible
 * style (Settings → Colour-blind-safe warnings) never relies on hue: a black
 * band under a white ring, diagonal stripes inside, and thicker lines, so it
 * reads the same with any kind of colour blindness and on any floor.
 */
export const WARNING_INK = 0x000000;
export const WARNING_LIGHT = 0xffffff;

/** Diagonal stripes clipped to a circle. */
function hatchCircle(g: Phaser.GameObjects.Graphics, x: number, y: number, radius: number, spacing: number, cross: boolean): void {
  const lines = (direction: 1 | -1): void => {
    const reach = radius * Math.SQRT2;
    for (let offset = -reach + (reach % spacing); offset <= reach; offset += spacing) {
      // A line x - direction*y = offset (rotated 45°), clipped to the circle.
      const half = Math.sqrt(Math.max(0, radius * radius - (offset * offset) / 2));
      const cx = x + offset / 2;
      const cy = y - direction * offset / 2;
      const dx = half / Math.SQRT2;
      g.lineBetween(cx - dx, cy - direction * dx, cx + dx, cy + direction * dx);
    }
  };
  lines(1);
  if (cross) lines(-1);
}

/** A circular danger zone. `strength` 0..1 lets a marker fade or fill in as it arms. */
export function drawWarningCircle(
  g: Phaser.GameObjects.Graphics, x: number, y: number, radius: number, color: number, accessible: boolean,
  options: { fillAlpha?: number; strength?: number; cross?: boolean; dashed?: boolean } = {},
): void {
  const strength = options.strength ?? 1;
  if (!accessible) {
    g.fillStyle(color, (options.fillAlpha ?? 0.1) * strength).fillCircle(x, y, radius);
    if (options.dashed) dashedRing(g, x, y, radius, 2, color, 0.9);
    else g.lineStyle(2, color, 0.85).strokeCircle(x, y, radius);
    return;
  }
  g.fillStyle(WARNING_INK, 0.22 + 0.12 * strength).fillCircle(x, y, radius);
  g.lineStyle(2.5, WARNING_INK, 0.55);
  hatchCircle(g, x, y, radius - 1, 7, Boolean(options.cross));
  g.lineStyle(1.2, WARNING_LIGHT, 0.45 + 0.4 * strength);
  hatchCircle(g, x, y, radius - 1, 7, Boolean(options.cross));
  g.lineStyle(5, WARNING_INK, 0.85).strokeCircle(x, y, radius);
  if (options.dashed) dashedRing(g, x, y, radius, 2.5, WARNING_LIGHT, 1);
  else g.lineStyle(2.5, WARNING_LIGHT, 1).strokeCircle(x, y, radius);
}

/** The aim line of a telegraphed attack, with a short bar at its end. */
export function drawWarningLine(g: Phaser.GameObjects.Graphics, x0: number, y0: number, angle: number, length: number, color: number, accessible: boolean): void {
  const x1 = x0 + Math.cos(angle) * length;
  const y1 = y0 + Math.sin(angle) * length;
  const nx = Math.cos(angle + Math.PI / 2) * (accessible ? 10 : 8);
  const ny = Math.sin(angle + Math.PI / 2) * (accessible ? 10 : 8);
  if (accessible) {
    g.lineStyle(6, WARNING_INK, 0.85).lineBetween(x0, y0, x1, y1).lineBetween(x1 - nx, y1 - ny, x1 + nx, y1 + ny);
    g.lineStyle(2.5, WARNING_LIGHT, 1).lineBetween(x0, y0, x1, y1).lineBetween(x1 - nx, y1 - ny, x1 + nx, y1 + ny);
    return;
  }
  g.lineStyle(2, color, 0.72).lineBetween(x0, y0, x1, y1).lineBetween(x1 - nx, y1 - ny, x1 + nx, y1 + ny);
}

function dashedRing(g: Phaser.GameObjects.Graphics, x: number, y: number, radius: number, width: number, color: number, alpha: number): void {
  g.lineStyle(width, color, alpha);
  for (let dash = 0; dash < 10; dash += 1) {
    const start = dash * Math.PI / 5;
    g.beginPath().arc(x, y, radius, start, start + Math.PI / 10).strokePath();
  }
}

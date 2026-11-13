const TAU = Math.PI * 2;

export function wrappedAngularDistance(a: number, b: number): number {
  let difference = (a - b + Math.PI) % TAU;
  if (difference < 0) difference += TAU;
  return Math.abs(difference - Math.PI);
}

/** Build a radial volley while guaranteeing an authored escape lane. */
export function ringAnglesWithGap(count: number, offset: number, gapAngle: number, gapHalfWidth: number): readonly number[] {
  if (count < 1) return [];
  return Array.from({ length: count }, (_, index) => offset + index * TAU / count)
    .filter((angle) => wrappedAngularDistance(angle, gapAngle) >= gapHalfWidth);
}

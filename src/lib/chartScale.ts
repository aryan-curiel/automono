/** Pure geometry for the hand-rolled dashboard SVG charts (replaces Recharts'
 * scale + "nice tick" machinery). No DOM, no React — unit-tested in
 * `chartScale.test.ts`. */

export interface AxisDomain {
  min: number;
  max: number;
  ticks: number[];
}

function niceNum(range: number, round: boolean): number {
  if (range <= 0) return 1;
  const exp = Math.floor(Math.log10(range));
  const frac = range / 10 ** exp;
  let niceFrac: number;
  if (round) {
    if (frac < 1.5) niceFrac = 1;
    else if (frac < 3) niceFrac = 2;
    else if (frac < 7) niceFrac = 5;
    else niceFrac = 10;
  } else {
    if (frac <= 1) niceFrac = 1;
    else if (frac <= 2) niceFrac = 2;
    else if (frac <= 5) niceFrac = 5;
    else niceFrac = 10;
  }
  return niceFrac * 10 ** exp;
}

/** A 0-anchored linear axis with rounded ("nice") tick values covering every
 * value in `values`. `tickCount` is a target, not a guarantee. */
export function axisDomain(values: number[], tickCount = 4): AxisDomain {
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  if (lo === hi) return { min: 0, max: 1, ticks: [0, 1] };

  const step = niceNum(niceNum(hi - lo, false) / Math.max(1, tickCount - 1), true);
  const min = Math.floor(lo / step) * step;
  const max = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = min; v <= max + step * 0.5; v += step) {
    ticks.push(Math.round(v * 1e6) / 1e6);
  }
  return { min, max, ticks };
}

/** Maps a data value onto its y pixel (SVG y grows downward). */
export function linearScale(domain: AxisDomain, top: number, plotH: number) {
  const span = domain.max - domain.min || 1;
  return (v: number) => top + plotH - ((v - domain.min) / span) * plotH;
}

/** SVG path for one column between `yTop` and `yBottom` (yTop <= yBottom),
 * rounding radius `r` at the data end only. */
export function barPath(
  x: number,
  w: number,
  yTop: number,
  yBottom: number,
  r: number,
  round: "top" | "bottom" | "none",
): string {
  const rr = Math.max(0, Math.min(r, w / 2, yBottom - yTop));
  if (round === "top") {
    return `M${x},${yBottom} L${x},${yTop + rr} Q${x},${yTop} ${x + rr},${yTop} H${x + w - rr} Q${x + w},${yTop} ${x + w},${yTop + rr} L${x + w},${yBottom} Z`;
  }
  if (round === "bottom") {
    return `M${x},${yTop} L${x},${yBottom - rr} Q${x},${yBottom} ${x + rr},${yBottom} H${x + w - rr} Q${x + w},${yBottom} ${x + w},${yBottom - rr} L${x + w},${yTop} Z`;
  }
  return `M${x},${yTop} H${x + w} V${yBottom} H${x} Z`;
}

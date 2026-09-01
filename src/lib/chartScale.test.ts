import { describe, expect, it } from "vitest";
import { axisDomain, barPath, linearScale } from "./chartScale";

describe("axisDomain", () => {
  it("anchors at 0 and rounds the max up to a nice value", () => {
    const d = axisDomain([120, 340, 500, 275]);
    expect(d.min).toBe(0);
    expect(d.max).toBeGreaterThanOrEqual(500);
    expect(d.ticks[0]).toBe(0);
    expect(d.ticks).toContain(d.max);
    // strictly increasing, evenly spaced
    const step = d.ticks[1] - d.ticks[0];
    for (let i = 1; i < d.ticks.length; i++) {
      expect(d.ticks[i] - d.ticks[i - 1]).toBeCloseTo(step);
    }
  });

  it("includes a 0 tick and extends both directions when values are negative", () => {
    const d = axisDomain([-300, 200, -50]);
    expect(d.min).toBeLessThanOrEqual(-300);
    expect(d.max).toBeGreaterThanOrEqual(200);
    expect(d.ticks).toContain(0);
  });

  it("degrades to a 0..1 axis when every value is 0 or the list is empty", () => {
    expect(axisDomain([0, 0, 0])).toEqual({ min: 0, max: 1, ticks: [0, 1] });
    expect(axisDomain([])).toEqual({ min: 0, max: 1, ticks: [0, 1] });
  });

  it("handles a single non-zero value", () => {
    const d = axisDomain([500]);
    expect(d.min).toBe(0);
    expect(d.max).toBeGreaterThanOrEqual(500);
    expect(d.ticks.length).toBeGreaterThanOrEqual(2);
  });
});

describe("linearScale", () => {
  it("maps min to the bottom and max to the top of the plot", () => {
    const d = axisDomain([0, 100]);
    const y = linearScale(d, 10, 200); // top=10, plotH=200 -> bottom=210
    expect(y(d.min)).toBeCloseTo(210);
    expect(y(d.max)).toBeCloseTo(10);
  });
});

describe("barPath", () => {
  it("returns a closed path and rounds only the requested end", () => {
    expect(barPath(0, 20, 10, 100, 4, "top")).toMatch(/^M.*Z$/);
    expect(barPath(0, 20, 10, 100, 4, "none")).toBe("M0,10 H20 V100 H0 Z");
  });

  it("clamps the corner radius to the bar's half-width and height", () => {
    // 2px tall bar can't take a 4px radius — must not produce NaN / inverted arcs
    const p = barPath(0, 20, 98, 100, 4, "top");
    expect(p).not.toMatch(/NaN/);
  });
});

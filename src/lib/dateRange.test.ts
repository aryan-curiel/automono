import { describe, expect, it } from "vitest";
import {
  compareQuarterKeys,
  monthRange,
  monthsInRange,
  nextQuarterKey,
  previousQuarterKey,
  priorYearPeriod,
  quarterMonths,
  quarterRange,
  yearRange,
} from "./dateRange";

describe("dateRange", () => {
  it("computes February bounds in a leap year", () => {
    expect(monthRange(2024, 2)).toMatchObject({ from: "2024-02-01", to: "2024-02-29" });
  });

  it("computes February bounds in a non-leap year", () => {
    expect(monthRange(2026, 2)).toMatchObject({ from: "2026-02-01", to: "2026-02-28" });
  });

  it("computes Q4 bounds spanning into December", () => {
    expect(quarterRange(2026, 4)).toMatchObject({ from: "2026-10-01", to: "2026-12-31" });
  });

  it("computes a full year span", () => {
    expect(yearRange(2026)).toMatchObject({ from: "2026-01-01", to: "2026-12-31" });
  });
});

describe("quarterMonths", () => {
  it("splits a quarter into its 3 calendar months", () => {
    expect(quarterMonths(2026, 2)).toEqual([
      monthRange(2026, 4),
      monthRange(2026, 5),
      monthRange(2026, 6),
    ]);
  });

  it("handles Q4 without rolling into the next year", () => {
    expect(quarterMonths(2026, 4)).toEqual([
      monthRange(2026, 10),
      monthRange(2026, 11),
      monthRange(2026, 12),
    ]);
  });
});

describe("monthsInRange", () => {
  it("counts a quarter as 3 months", () => {
    const q = quarterRange(2026, 2);
    expect(monthsInRange(q.from, q.to)).toBe(3);
  });

  it("counts a single month as 1", () => {
    const m = monthRange(2026, 6);
    expect(monthsInRange(m.from, m.to)).toBe(1);
  });

  it("counts a full year as 12", () => {
    const y = yearRange(2026);
    expect(monthsInRange(y.from, y.to)).toBe(12);
  });
});

describe("priorYearPeriod", () => {
  it("shifts a quarter back one year, updating the label", () => {
    expect(priorYearPeriod(quarterRange(2026, 3))).toEqual({
      from: "2025-07-01",
      to: "2025-09-30",
      label: "Q3 2025",
    });
  });

  it("clamps Feb 29 into a non-leap prior year", () => {
    expect(priorYearPeriod(monthRange(2024, 2))).toMatchObject({
      from: "2023-02-01",
      to: "2023-02-28",
    });
  });
});

describe("previousQuarterKey / nextQuarterKey", () => {
  it("steps back within a year", () => {
    expect(previousQuarterKey("2026-Q3")).toBe("2026-Q2");
  });

  it("steps back across a year boundary", () => {
    expect(previousQuarterKey("2026-Q1")).toBe("2025-Q4");
  });

  it("is the inverse of nextQuarterKey across a year boundary", () => {
    expect(previousQuarterKey(nextQuarterKey("2025-Q4"))).toBe("2025-Q4");
  });
});

describe("compareQuarterKeys", () => {
  it("orders chronologically across years", () => {
    expect(compareQuarterKeys("2025-Q4", "2026-Q1")).toBeLessThan(0);
    expect(compareQuarterKeys("2026-Q1", "2025-Q4")).toBeGreaterThan(0);
    expect(compareQuarterKeys("2026-Q2", "2026-Q2")).toBe(0);
  });
});

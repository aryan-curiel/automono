import { describe, expect, it } from "vitest";
import { monthRange, priorYearPeriod, quarterRange, yearRange } from "./dateRange";

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

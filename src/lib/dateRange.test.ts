import { describe, expect, it } from "vitest";
import { monthRange, quarterRange, yearRange } from "./dateRange";

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

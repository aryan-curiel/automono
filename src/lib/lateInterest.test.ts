import { describe, expect, it } from "vitest";
import { daysOverdue, lateInterestOwed } from "./lateInterest";

describe("daysOverdue", () => {
  it("is zero for a due date today or in the future", () => {
    expect(daysOverdue("2026-08-03", "2026-08-03")).toBe(0);
    expect(daysOverdue("2026-08-10", "2026-08-03")).toBe(0);
  });

  it("counts full days past the due date", () => {
    expect(daysOverdue("2026-07-20", "2026-08-03")).toBe(14);
  });
});

describe("lateInterestOwed", () => {
  it("is zero when nothing is overdue", () => {
    expect(lateInterestOwed(1000, 8, 0)).toBe(0);
  });

  it("accrues simple daily interest at the annual rate", () => {
    // 1000 EUR at 8%/year for 365 days = 80 EUR exactly.
    expect(lateInterestOwed(1000, 8, 365)).toBeCloseTo(80, 5);
  });

  it("scales linearly with days overdue", () => {
    expect(lateInterestOwed(1000, 8, 36.5)).toBeCloseTo(8, 5);
  });
});

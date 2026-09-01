import { describe, expect, it } from "vitest";
import { nextTaxDeadlines, deadlineQuarterKey } from "./taxCalendar";

describe("nextTaxDeadlines", () => {
  it("returns the next N deadlines in chronological order", () => {
    const deadlines = nextTaxDeadlines("2026-08-02", 3);
    expect(deadlines).toEqual([
      { model: "130/303", label: "Modelo 130/303 (3T)", dueDate: "2026-10-20" },
      {
        model: "130/303 + 190/390",
        label: "Modelo 130/303 (4T) + Modelo 190/390 (anual)",
        dueDate: "2027-02-01",
      },
      { model: "130/303", label: "Modelo 130/303 (1T)", dueDate: "2027-04-20" },
    ]);
  });

  it("collapses the Q4 quarterly and the annual summary into one row (same due date)", () => {
    const deadlines = nextTaxDeadlines("2026-12-25", 2);
    expect(deadlines).toEqual([
      {
        model: "130/303 + 190/390",
        label: "Modelo 130/303 (4T) + Modelo 190/390 (anual)",
        dueDate: "2027-02-01",
      },
      { model: "130/303", label: "Modelo 130/303 (1T)", dueDate: "2027-04-20" },
    ]);
  });

  it("rolls a deadline that lands on a weekend forward to the Monday", () => {
    // 20 Apr 2025 is a Sunday.
    const [q1] = nextTaxDeadlines("2025-04-01", 1);
    expect(q1).toEqual({ model: "130/303", label: "Modelo 130/303 (1T)", dueDate: "2025-04-21" });
  });

  it("includes a deadline that falls exactly today (still actionable)", () => {
    const deadlines = nextTaxDeadlines("2026-10-20", 1);
    expect(deadlines[0].dueDate).toBe("2026-10-20");
  });
});

describe("deadlineQuarterKey", () => {
  it("maps a Q1 deadline (month 4) to the same year's Q1", () => {
    expect(deadlineQuarterKey("2026-04-20")).toBe("2026-Q1");
  });

  it("maps a Q2 deadline (month 7) to the same year's Q2", () => {
    expect(deadlineQuarterKey("2026-07-20")).toBe("2026-Q2");
  });

  it("maps a Q3 deadline (month 10) to the same year's Q3", () => {
    expect(deadlineQuarterKey("2026-10-20")).toBe("2026-Q3");
  });

  it("rolls a January deadline back to Q4 of the PREVIOUS year", () => {
    expect(deadlineQuarterKey("2026-01-20")).toBe("2025-Q4");
  });

  it("still resolves Q4 when a weekend roll pushed the deadline into February", () => {
    expect(deadlineQuarterKey("2027-02-01")).toBe("2026-Q4");
  });
});

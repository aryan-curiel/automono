import { describe, expect, it } from "vitest";
import { nextTaxDeadlines } from "./taxCalendar";

describe("nextTaxDeadlines", () => {
  it("returns the next N deadlines in chronological order", () => {
    const deadlines = nextTaxDeadlines("2026-08-02", 3);
    expect(deadlines).toEqual([
      { model: "130/303", label: "Modelo 130/303 (3T)", dueDate: "2026-10-20" },
      { model: "130/303", label: "Modelo 130/303 (4T)", dueDate: "2027-01-20" },
      { model: "190/390", label: "Modelo 190/390 (anual)", dueDate: "2027-01-30" },
    ]);
  });

  it("rolls from Q4 into January of the next year", () => {
    const deadlines = nextTaxDeadlines("2026-12-25", 2);
    expect(deadlines).toEqual([
      { model: "130/303", label: "Modelo 130/303 (4T)", dueDate: "2027-01-20" },
      { model: "190/390", label: "Modelo 190/390 (anual)", dueDate: "2027-01-30" },
    ]);
  });

  it("includes a deadline that falls exactly today (still actionable)", () => {
    const deadlines = nextTaxDeadlines("2026-10-20", 1);
    expect(deadlines[0].dueDate).toBe("2026-10-20");
  });
});

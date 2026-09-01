import { describe, expect, it } from "vitest";
import { dueFilingReminders } from "./filingReminders";
import type { TaxDeadline } from "./taxCalendar";

const q3: TaxDeadline = {
  model: "130/303",
  label: "Modelo 130/303 (3T)",
  dueDate: "2026-10-20",
};

describe("dueFilingReminders", () => {
  it("stays silent when the deadline is more than 7 days out", () => {
    expect(dueFilingReminders("2026-10-10", [q3], new Set(), new Set())).toEqual([]);
  });

  it("fires the 7-day reminder once the deadline is within a week", () => {
    const [r] = dueFilingReminders("2026-10-14", [q3], new Set(), new Set());
    expect(r).toMatchObject({ dueDate: "2026-10-20", daysUntil: 6, sentKeys: ["2026-10-20:7"] });
  });

  it("carries every reached threshold in sentKeys (3 days out => 7 and 3)", () => {
    const [r] = dueFilingReminders("2026-10-17", [q3], new Set(), new Set());
    expect(r.daysUntil).toBe(3);
    expect(r.sentKeys).toEqual(["2026-10-20:7", "2026-10-20:3"]);
  });

  it("fires on the due date itself (daysUntil 0)", () => {
    const [r] = dueFilingReminders("2026-10-20", [q3], new Set(), new Set());
    expect(r.daysUntil).toBe(0);
    expect(r.sentKeys).toEqual(["2026-10-20:7", "2026-10-20:3", "2026-10-20:1"]);
  });

  it("skips a deadline that has already passed", () => {
    expect(dueFilingReminders("2026-10-21", [q3], new Set(), new Set())).toEqual([]);
  });

  it("skips a quarter whose declaration is already filed", () => {
    const filed = new Set(["2026-Q3"]);
    expect(dueFilingReminders("2026-10-17", [q3], filed, new Set())).toEqual([]);
  });

  it("does not re-fire a threshold already recorded as sent", () => {
    const sent = new Set(["2026-10-20:7"]);
    expect(dueFilingReminders("2026-10-14", [q3], new Set(), sent)).toEqual([]);
  });

  it("still fires the tighter threshold after the looser one was sent", () => {
    const sent = new Set(["2026-10-20:7"]);
    const [r] = dueFilingReminders("2026-10-17", [q3], new Set(), sent);
    expect(r.daysUntil).toBe(3);
    expect(r.sentKeys).toEqual(["2026-10-20:7", "2026-10-20:3"]);
  });
});

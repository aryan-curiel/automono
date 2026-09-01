import { describe, expect, it } from "vitest";
import { formatDate, formatEUR } from "./format";

describe("formatEUR", () => {
  it("formats with thousands separator, two decimals, and euro sign", () => {
    expect(formatEUR(1234.5)).toBe("1.234,50 €");
  });
});

describe("formatDate", () => {
  it("formats an ISO date as dd/mm/yyyy", () => {
    expect(formatDate("2026-03-09")).toBe("09/03/2026");
  });

  it("returns an em-dash for a missing date", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
    expect(formatDate("")).toBe("—");
  });
});

import { describe, expect, it } from "vitest";
import { formatEUR } from "./format";

describe("formatEUR", () => {
  it("formats with thousands separator, two decimals, and euro sign", () => {
    expect(formatEUR(1234.5)).toBe("1.234,50 €");
  });
});

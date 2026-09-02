import { describe, expect, it } from "vitest";
import { nextQuoteSeq, quoteNumberLabel } from "./numbering";

describe("quoteNumberLabel", () => {
  it("zero-pads the sequence to 3 digits with a PRE- prefix", () => {
    expect(quoteNumberLabel({ year: 2026, seq: 7 })).toBe("PRE-2026-007");
    expect(quoteNumberLabel({ year: 2026, seq: 123 })).toBe("PRE-2026-123");
    expect(quoteNumberLabel({ year: 2025, seq: 1 })).toBe("PRE-2025-001");
  });

  it("does not truncate a 4-digit sequence", () => {
    expect(quoteNumberLabel({ year: 2026, seq: 1042 })).toBe("PRE-2026-1042");
  });
});

describe("nextQuoteSeq", () => {
  it("starts at 1 for a year with no quotes", () => {
    expect(nextQuoteSeq([])).toBe(1);
  });

  it("is one past the highest used seq, ignoring gaps and order", () => {
    expect(nextQuoteSeq([1, 2, 3])).toBe(4);
    expect(nextQuoteSeq([3, 1, 2])).toBe(4);
    expect(nextQuoteSeq([1, 5])).toBe(6);
  });
});

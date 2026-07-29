import { describe, expect, it } from "vitest";
import { csvRow } from "./csv";

describe("csvRow", () => {
  it("joins plain values with commas", () => {
    expect(csvRow(["a", 1, "b"])).toBe("a,1,b");
  });

  it("quotes and escapes values containing commas, quotes, or newlines", () => {
    expect(csvRow(['Acme, "Inc"', "line1\nline2"])).toBe('"Acme, ""Inc""","line1\nline2"');
  });
});

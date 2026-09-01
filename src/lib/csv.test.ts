import { describe, expect, it } from "vitest";
import { csvRow } from "./csv";

describe("csvRow", () => {
  it("joins plain values with commas", () => {
    expect(csvRow(["a", 1, "b"])).toBe("a,1,b");
  });

  it("quotes and escapes values containing commas, quotes, or newlines", () => {
    expect(csvRow(['Acme, "Inc"', "line1\nline2"])).toBe('"Acme, ""Inc""","line1\nline2"');
  });

  it("prefixes text fields that start with a formula trigger", () => {
    expect(csvRow(["=1+1", "+7", "-cmd", "@SUM(A1)"])).toBe("'=1+1,'+7,'-cmd,'@SUM(A1)");
  });

  it("still quotes a formula field that also contains a comma", () => {
    expect(csvRow(["=1,2"])).toBe('"\'=1,2"');
  });

  it("leaves negative numbers untouched", () => {
    expect(csvRow([-5, -12.34])).toBe("-5,-12.34");
  });
});

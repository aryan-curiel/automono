import { describe, expect, it } from "vitest";
import { mkLine, withRemovedLine, withUpdatedLine } from "./lines";

describe("withUpdatedLine", () => {
  it("updates only the targeted field on the targeted line", () => {
    const lines = [mkLine("a", 1, 10), mkLine("b", 2, 20)];
    const next = withUpdatedLine(lines, 1, "quantity", "5");
    expect(next[0]).toBe(lines[0]);
    expect(next[1].quantity).toBe("5");
    expect(next[1].description).toBe("b");
  });
});

describe("withRemovedLine", () => {
  it("removes the line at the given index", () => {
    const lines = [mkLine("a", 1, 10), mkLine("b", 2, 20)];
    const next = withRemovedLine(lines, 0);
    expect(next).toHaveLength(1);
    expect(next[0].description).toBe("b");
  });

  it("never leaves the list empty — resets to a single blank line", () => {
    const next = withRemovedLine([mkLine("only", 1, 10)], 0);
    expect(next).toHaveLength(1);
    expect(next[0].description).toBe("");
  });
});

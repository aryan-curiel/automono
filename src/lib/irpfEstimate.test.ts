import { describe, expect, it } from "vitest";
import { estimateAnnualIrpf, estimateIrpf } from "./irpfEstimate";

describe("estimateIrpf", () => {
  it("is 0 for a non-positive base", () => {
    expect(estimateIrpf(0).tax).toBe(0);
    expect(estimateIrpf(-1000).tax).toBe(0);
  });

  it("applies only the first bracket below the first edge", () => {
    const r = estimateIrpf(10_000);
    expect(r.tax).toBe(1900); // 10_000 * 19%
    expect(r.marginalRate).toBe(19);
    expect(r.perBracket).toHaveLength(1);
  });

  it("stacks brackets progressively", () => {
    // 24_450: 12_450@19 + 7_750@24 + 4_250@30 = 2365.5 + 1860 + 1275
    const r = estimateIrpf(24_450);
    expect(r.tax).toBe(5500.5);
    expect(r.marginalRate).toBe(30);
    expect(r.perBracket).toHaveLength(3);
  });

  it("reaches the top open bracket", () => {
    // 300_000: 2365.5 + 1860 + 4500 + 9176 + 108000 = 125901.5, still marginal 45
    const r = estimateIrpf(300_000);
    expect(r.tax).toBe(125_901.5);
    expect(r.marginalRate).toBe(45);
  });
});

describe("estimateAnnualIrpf", () => {
  it("knocks off the personal allowance before the scale", () => {
    const r = estimateAnnualIrpf(30_000); // default allowance 5_550 -> base 24_450
    expect(r.taxableBase).toBe(24_450);
    expect(r.tax).toBe(5500.5);
    expect(r.marginalRate).toBe(30);
    expect(r.effectiveRate).toBeCloseTo(22.5, 1);
  });

  it("floors the taxable base at 0 when net is under the allowance", () => {
    const r = estimateAnnualIrpf(4_000);
    expect(r.taxableBase).toBe(0);
    expect(r.tax).toBe(0);
    expect(r.effectiveRate).toBe(0);
  });

  it("honours a custom allowance", () => {
    const r = estimateAnnualIrpf(10_000, { personalAllowance: 0 });
    expect(r.taxableBase).toBe(10_000);
    expect(r.tax).toBe(1900);
  });
});

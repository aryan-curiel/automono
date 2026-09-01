import { describe, expect, it } from "vitest";
import { defaultIrpfRate, irpfApplicable, suggestVatTreatment } from "./taxDefaults";

describe("suggestVatTreatment", () => {
  it("defaults unset country to standard", () => {
    expect(suggestVatTreatment(null)).toBe("standard");
  });

  it("treats Spain as standard", () => {
    expect(suggestVatTreatment("ES")).toBe("standard");
  });

  it("treats other EU countries as reverse charge", () => {
    expect(suggestVatTreatment("BG")).toBe("reverse_charge_eu");
  });

  it("treats non-EU countries as export outside EU", () => {
    expect(suggestVatTreatment("US")).toBe("export_outside_eu");
  });
});

describe("irpfApplicable", () => {
  it("applies for unset country", () => {
    expect(irpfApplicable(null)).toBe(true);
  });

  it("applies for Spain", () => {
    expect(irpfApplicable("ES")).toBe(true);
  });

  it("does not apply for other EU countries", () => {
    expect(irpfApplicable("BG")).toBe(false);
  });

  it("does not apply outside the EU", () => {
    expect(irpfApplicable("US")).toBe(false);
  });
});

describe("defaultIrpfRate", () => {
  it("uses the reduced rate in the alta year", () => {
    expect(defaultIrpfRate("2024-06-01", new Date("2024-03-01"))).toBe(7);
  });

  it("uses the reduced rate for the two years after alta", () => {
    expect(defaultIrpfRate("2024-06-01", new Date("2026-12-31"))).toBe(7);
  });

  it("switches to the standard rate from the third year after alta", () => {
    expect(defaultIrpfRate("2024-06-01", new Date("2027-01-01"))).toBe(15);
  });

  it("assumes just-registered when no alta date is known", () => {
    expect(defaultIrpfRate(null)).toBe(7);
    expect(defaultIrpfRate("")).toBe(7);
    expect(defaultIrpfRate("not-a-date")).toBe(7);
  });
});

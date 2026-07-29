import { describe, expect, it } from "vitest";
import { irpfApplicable, suggestVatTreatment } from "./taxDefaults";

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

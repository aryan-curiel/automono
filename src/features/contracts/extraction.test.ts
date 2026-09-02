import { describe, expect, it } from "vitest";
import { mapContractTerms, type ContractTermsLlm } from "./extraction";

const raw = (over: Partial<ContractTermsLlm> = {}): ContractTermsLlm => ({
  base: null,
  cadence: null,
  irpfRate: null,
  vatTreatment: null,
  description: null,
  ...over,
});

describe("mapContractTerms", () => {
  it("maps a full monthly Spanish-client contract", () => {
    const out = mapContractTerms(
      raw({
        base: 1200,
        cadence: "monthly",
        irpfRate: 15,
        vatTreatment: "standard",
        description: "Servicios de consultoría — cuota mensual",
      }),
    );
    expect(out.billingCadence).toBe("monthly");
    expect(out.firstLine).toEqual({
      description: "Servicios de consultoría — cuota mensual",
      base: 1200,
      irpfRate: 15,
      vatTreatment: "standard",
    });
  });

  it("normalizes cadence aliases and treats one-off / unknown as none", () => {
    expect(mapContractTerms(raw({ cadence: "Annual" })).billingCadence).toBe("yearly");
    expect(mapContractTerms(raw({ cadence: "per month" })).billingCadence).toBe("monthly");
    expect(mapContractTerms(raw({ cadence: "one-off" })).billingCadence).toBe("none");
    expect(mapContractTerms(raw({ cadence: "whenever" })).billingCadence).toBe("none");
  });

  it("rejects an unknown vat treatment and non-positive base", () => {
    const out = mapContractTerms(raw({ base: 0, vatTreatment: "vat21", description: "x" }));
    expect(out.firstLine).toEqual({
      description: "x",
      base: null,
      irpfRate: null,
      vatTreatment: null,
    });
  });

  it("keeps a 0 IRPF rate (explicit no-retention) but drops a negative one", () => {
    expect(mapContractTerms(raw({ base: 500, irpfRate: 0 })).firstLine?.irpfRate).toBe(0);
    expect(mapContractTerms(raw({ base: 500, irpfRate: -5 })).firstLine?.irpfRate).toBe(null);
  });

  it("returns no firstLine when neither amount nor description was found", () => {
    expect(mapContractTerms(raw({ cadence: "monthly" })).firstLine).toBe(null);
  });
});

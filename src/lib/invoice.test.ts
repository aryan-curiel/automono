import { describe, expect, it } from "vitest";
import { amountsFromLines, invoiceNumberLabel, roundCents } from "./invoice";
import type { InvoiceLineRecord } from "../db/invoices";

function line(overrides: Partial<InvoiceLineRecord>): InvoiceLineRecord {
  return {
    id: 1,
    invoiceId: 1,
    description: "",
    quantity: 1,
    unitPrice: 0,
    total: 0,
    ...overrides,
  };
}

describe("roundCents", () => {
  it("clears binary floating-point noise", () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(roundCents(0.1 + 0.2)).toBe(0.3);
  });
});

describe("amountsFromLines", () => {
  it("rounds subtotal/iva/irpf/total to the cent instead of leaking float noise", () => {
    const amounts = amountsFromLines(
      [line({ quantity: 1, unitPrice: 10.1 }), line({ quantity: 1, unitPrice: 20.2 })],
      21,
      0,
    );
    expect(amounts.subtotal).toBe(30.3);
    expect(amounts.ivaAmount).toBe(6.36);
    expect(amounts.total).toBe(36.66);
  });

  it("subtracts IRPF from subtotal + IVA", () => {
    const amounts = amountsFromLines([line({ quantity: 1, unitPrice: 1000 })], 21, 15);
    expect(amounts).toEqual({ subtotal: 1000, ivaAmount: 210, irpfAmount: 150, total: 1060 });
  });
});

describe("invoiceNumberLabel", () => {
  it("labels an unissued invoice as a draft", () => {
    expect(
      invoiceNumberLabel({ seriesPrefix: null, invoiceNumber: null, isRectification: false }),
    ).toBe("Borrador");
  });

  it("pads the number and prefixes rectifications with R", () => {
    expect(
      invoiceNumberLabel({ seriesPrefix: "AAA", invoiceNumber: 7, isRectification: false }),
    ).toBe("AAA-007");
    expect(
      invoiceNumberLabel({ seriesPrefix: "AAA", invoiceNumber: 7, isRectification: true }),
    ).toBe("AAA-R007");
  });
});

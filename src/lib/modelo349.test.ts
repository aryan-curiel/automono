import { describe, expect, it } from "vitest";
import { buildModelo349, buildModelo349Csv } from "./modelo349";
import { quarterRange } from "./dateRange";
import type { InvoiceListItem } from "../db/invoices";

function invoice(overrides: Partial<InvoiceListItem>): InvoiceListItem {
  return {
    id: 1,
    clientId: 1,
    clientName: "Acme GmbH",
    seriesPrefix: "AAA",
    invoiceNumber: 1,
    issueDate: "2026-01-10",
    dueDate: "2026-02-09",
    status: "issued",
    isRectification: false,
    rectifiesInvoiceId: null,
    rectifiedByInvoiceId: null,
    subtotal: 100,
    ivaRate: 0,
    ivaAmount: 0,
    irpfRate: 0,
    irpfAmount: 0,
    total: 100,
    pdfPath: null,
    clientCountry: "DE",
    vatTreatment: "reverse_charge_eu",
    clientVatNumber: "DE123456789",
    clientNif: "DE12345678Z",
    ...overrides,
  };
}

const q1 = quarterRange(2026, 1);

describe("buildModelo349", () => {
  it("sums multiple invoices for the same intracomunitario client into one row", () => {
    const { rows, total } = buildModelo349(
      [
        invoice({ id: 1, subtotal: 100 }),
        invoice({ id: 2, subtotal: 250, issueDate: "2026-02-01" }),
      ],
      q1,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      clientId: 1,
      clientName: "Acme GmbH",
      vatNumber: "DE123456789",
      country: "DE",
      clave: "S",
      base: 350,
    });
    expect(total).toBe(350);
  });

  it("excludes non-reverse-charge clients", () => {
    const { rows } = buildModelo349(
      [invoice({ id: 1 }), invoice({ id: 2, clientId: 2, vatTreatment: "standard" })],
      q1,
    );
    expect(rows.map((r) => r.clientId)).toEqual([1]);
  });

  it("excludes drafts and invoices outside the period", () => {
    const { rows, total } = buildModelo349(
      [
        invoice({ id: 1, status: "draft" }),
        invoice({ id: 2, clientId: 2, issueDate: "2026-05-01" }),
        invoice({ id: 3, clientId: 3, issueDate: null }),
      ],
      q1,
    );
    expect(rows).toHaveLength(0);
    expect(total).toBe(0);
  });

  it("keeps one row per client, sorted by name", () => {
    const { rows } = buildModelo349(
      [
        invoice({ id: 1, clientId: 2, clientName: "Zeta SàRL", subtotal: 10 }),
        invoice({ id: 2, clientId: 1, clientName: "Alfa Oy", subtotal: 20 }),
      ],
      q1,
    );
    expect(rows.map((r) => r.clientName)).toEqual(["Alfa Oy", "Zeta SàRL"]);
  });

  it("tolerates a missing VAT number", () => {
    const { rows } = buildModelo349([invoice({ clientVatNumber: null })], q1);
    expect(rows[0].vatNumber).toBeNull();
  });
});

describe("buildModelo349Csv", () => {
  it("renders a header, one row per client and a total line", () => {
    const summary = buildModelo349([invoice({ subtotal: 100 })], q1);
    const csv = buildModelo349Csv(summary, q1);
    const lines = csv.split("\n");
    expect(lines[0]).toContain("Modelo 349");
    expect(lines[1]).toBe("Cliente,NIF-IVA,País,Clave,Base imponible");
    expect(lines[2]).toBe("Acme GmbH,DE123456789,DE,S,100");
    expect(lines[3]).toBe("Total,,,,100");
  });
});

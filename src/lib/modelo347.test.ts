import { describe, expect, it } from "vitest";
import { buildModelo347, buildModelo347Csv, MODELO_347_THRESHOLD } from "./modelo347";
import type { InvoiceListItem } from "../db/invoices";
import type { ExpenseRecord } from "../db/expenses";

function invoice(overrides: Partial<InvoiceListItem>): InvoiceListItem {
  return {
    id: 1,
    clientId: 1,
    clientName: "Cliente SL",
    seriesPrefix: "AAA",
    invoiceNumber: 1,
    issueDate: "2026-02-10",
    dueDate: "2026-03-12",
    status: "issued",
    isRectification: false,
    rectifiesInvoiceId: null,
    rectifiedByInvoiceId: null,
    subtotal: 2000,
    ivaRate: 21,
    ivaAmount: 420,
    irpfRate: 0,
    irpfAmount: 0,
    total: 2420,
    pdfPath: null,
    clientCountry: "ES",
    vatTreatment: "standard",
    clientVatNumber: null,
    clientNif: "B12345678",
    ...overrides,
  };
}

function expense(overrides: Partial<ExpenseRecord>): ExpenseRecord {
  return {
    id: 1,
    date: "2026-02-10",
    category: "Software",
    description: null,
    provider: "Proveedor SA",
    amount: 3000,
    ivaAmount: 630,
    deductiblePct: 100,
    ivaDeductiblePct: null,
    irpfRate: null,
    irpfAmount: null,
    receiptFilePath: null,
    declaredPeriod: null,
    paidDate: null,
    declared: false,
    ...overrides,
  };
}

describe("buildModelo347", () => {
  it("lists a client over the threshold with a per-quarter breakdown (base + IVA)", () => {
    const summary = buildModelo347(
      [
        invoice({ id: 1, issueDate: "2026-02-10", subtotal: 2000, ivaAmount: 420 }),
        invoice({ id: 2, issueDate: "2026-08-01", subtotal: 1000, ivaAmount: 210 }),
      ],
      [],
      2026,
    );
    expect(summary.rows).toHaveLength(1);
    expect(summary.rows[0]).toMatchObject({
      side: "sales",
      name: "Cliente SL",
      nif: "B12345678",
      quarters: [2420, 0, 1210, 0],
      total: 3630,
    });
  });

  it("drops a counterparty at or below 3.005,06 €", () => {
    const summary = buildModelo347(
      [invoice({ subtotal: 2483.1, ivaAmount: 521.45 })], // total 3004.55
      [],
      2026,
    );
    expect(summary.rows).toHaveLength(0);
    expect(MODELO_347_THRESHOLD).toBe(3005.06);
  });

  it("excludes intra-community and export invoices (Modelo 349 / out of scope)", () => {
    const summary = buildModelo347(
      [
        invoice({
          id: 1,
          clientId: 1,
          vatTreatment: "reverse_charge_eu",
          subtotal: 9000,
          ivaAmount: 0,
        }),
        invoice({
          id: 2,
          clientId: 2,
          vatTreatment: "export_outside_eu",
          subtotal: 9000,
          ivaAmount: 0,
        }),
      ],
      [],
      2026,
    );
    expect(summary.rows).toHaveLength(0);
  });

  it("excludes invoices with IRPF withholding (Modelo 190)", () => {
    const summary = buildModelo347(
      [invoice({ subtotal: 9000, ivaAmount: 1890, irpfAmount: 1350 })],
      [],
      2026,
    );
    expect(summary.rows).toHaveLength(0);
  });

  it("excludes drafts and invoices outside the year", () => {
    const summary = buildModelo347(
      [
        invoice({ id: 1, status: "draft", subtotal: 9000 }),
        invoice({ id: 2, clientId: 2, issueDate: "2025-11-01", subtotal: 9000 }),
      ],
      [],
      2026,
    );
    expect(summary.rows).toHaveLength(0);
  });

  it("groups expenses by provider (case-insensitive), amount IVA-included", () => {
    const summary = buildModelo347(
      [],
      [
        expense({
          id: 1,
          provider: "Hosting Co",
          date: "2026-01-15",
          amount: 2000,
          ivaAmount: 420,
        }),
        expense({ id: 2, provider: "hosting co", date: "2026-04-15", amount: 500, ivaAmount: 105 }),
      ],
      2026,
    );
    expect(summary.rows).toHaveLength(1);
    expect(summary.rows[0]).toMatchObject({
      side: "purchases",
      name: "Hosting Co",
      nif: null,
      quarters: [2420, 605, 0, 0],
      total: 3025,
    });
  });

  it("skips expenses with no provider and expenses with IRPF withholding", () => {
    const summary = buildModelo347(
      [],
      [
        expense({ id: 1, provider: null, amount: 9000, ivaAmount: 0 }),
        expense({ id: 2, provider: "Notario", amount: 9000, ivaAmount: 0, irpfAmount: 100 }),
      ],
      2026,
    );
    expect(summary.rows).toHaveLength(0);
  });

  it("keeps sales and purchases as separate rows, sorted by side then name", () => {
    const summary = buildModelo347(
      [invoice({ clientId: 7, clientName: "Zeta Client", subtotal: 4000, ivaAmount: 840 })],
      [expense({ provider: "Alpha Provider", amount: 4000, ivaAmount: 840 })],
      2026,
    );
    expect(summary.rows.map((r) => [r.side, r.name])).toEqual([
      ["purchases", "Alpha Provider"],
      ["sales", "Zeta Client"],
    ]);
    expect(summary.total).toBe(9680);
  });
});

describe("buildModelo347Csv", () => {
  it("renders a header, a typed row per counterparty and a total line", () => {
    const summary = buildModelo347(
      [invoice({ subtotal: 3000, ivaAmount: 630, issueDate: "2026-05-01" })],
      [],
      2026,
    );
    const lines = buildModelo347Csv(summary).split("\n");
    expect(lines[0]).toBe("Modelo 347 · 2026");
    expect(lines[1]).toBe("Tipo,Nombre,NIF,T1,T2,T3,T4,Total anual");
    expect(lines[2]).toBe("Ventas (B),Cliente SL,B12345678,0,3630,0,0,3630");
    expect(lines[3]).toBe("Total,,,,,,,3630");
  });
});

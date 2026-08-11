import { describe, expect, it } from "vitest";
import { buildDeclarationSnapshot } from "./quarterlyDeclaration";
import { buildModeloReport, expectedCasillas, type ModeloFields } from "./modeloReport";
import type { InvoiceListItem } from "../db/invoices";
import type { ExpenseRecord } from "../db/expenses";

function invoice(overrides: Partial<InvoiceListItem>): InvoiceListItem {
  return {
    id: 1,
    clientId: 1,
    clientName: "Acme",
    seriesPrefix: "AAA",
    invoiceNumber: 1,
    issueDate: "2026-07-10",
    dueDate: "2026-08-09",
    status: "issued",
    isRectification: false,
    rectifiesInvoiceId: null,
    rectifiedByInvoiceId: null,
    subtotal: 100,
    ivaRate: 21,
    ivaAmount: 21,
    irpfRate: 15,
    irpfAmount: 15,
    total: 106,
    pdfPath: null,
    clientCountry: null,
    ...overrides,
  };
}

function expense(overrides: Partial<ExpenseRecord>): ExpenseRecord {
  return {
    id: 1,
    date: "2026-07-10",
    category: "Software",
    description: null,
    amount: 50,
    ivaAmount: null,
    deductiblePct: 100,
    irpfRate: null,
    irpfAmount: null,
    receiptFilePath: null,
    declaredPeriod: null,
    declared: false,
    ...overrides,
  };
}

const emptyFields: ModeloFields = {
  ivaDevengado: null,
  ivaDeducible: null,
  resultadoLiquidacion: null,
  rendimientoNeto: null,
  pagoFraccionado: null,
  baseRetenciones: null,
  retencionesIngresadas: null,
};

describe("expectedCasillas", () => {
  it("computes 303 IVA devengado/deducible/resultado", () => {
    const snapshot = buildDeclarationSnapshot(
      [invoice({ subtotal: 1000, ivaRate: 21, ivaAmount: 210 })],
      [expense({ amount: 100, deductiblePct: 100, ivaAmount: 21 })],
    );
    const rows = expectedCasillas("303", snapshot);
    expect(rows).toEqual([
      { key: "ivaDevengado", label: "IVA devengado", expected: 210 },
      { key: "ivaDeducible", label: "IVA deducible", expected: 21 },
      { key: "resultadoLiquidacion", label: "Resultado de la liquidación", expected: 189 },
    ]);
  });

  it("computes 130 rendimiento neto and pago fraccionado, clamped at zero", () => {
    const snapshot = buildDeclarationSnapshot(
      [invoice({ subtotal: 1000, irpfAmount: 250 })],
      [expense({ amount: 200, deductiblePct: 100 })],
    );
    // netIrpfIncome = 800; 20% = 160; minus irpfWithheld 250 -> negative, clamped to 0
    const rows = expectedCasillas("130", snapshot);
    expect(rows).toEqual([
      { key: "rendimientoNeto", label: "Rendimiento neto", expected: 800 },
      { key: "pagoFraccionado", label: "Pago fraccionado (20%)", expected: 0 },
    ]);
  });

  it("computes 111 base/retenciones only from expenses that actually withheld IRPF", () => {
    const snapshot = buildDeclarationSnapshot(
      [],
      [
        expense({ id: 1, amount: 300, irpfAmount: 21 }),
        expense({ id: 2, amount: 100, irpfAmount: 0 }),
      ],
    );
    const rows = expectedCasillas("111", snapshot);
    expect(rows).toEqual([
      { key: "baseRetenciones", label: "Base de retenciones", expected: 300 },
      { key: "retencionesIngresadas", label: "Retenciones ingresadas", expected: 21 },
    ]);
  });
});

describe("buildModeloReport", () => {
  const snapshot = buildDeclarationSnapshot(
    [invoice({ subtotal: 1000, ivaRate: 21, ivaAmount: 210 })],
    [expense({ amount: 100, deductiblePct: 100, ivaAmount: 21 })],
  );
  const period = { expectedYear: 2026, expectedQuarter: 3 };

  it("flags matching values within tolerance", () => {
    const extracted: ModeloFields = {
      ...emptyFields,
      ivaDevengado: 210,
      ivaDeducible: 21,
      resultadoLiquidacion: 189.01,
    };
    const rows = buildModeloReport("303", snapshot, extracted, {
      ...period,
      detectedYear: 2026,
      detectedQuarter: 3,
    });
    expect(rows.find((r) => r.key === "period")?.status).toBe("match");
    expect(rows.find((r) => r.key === "ivaDevengado")?.status).toBe("match");
    expect(rows.find((r) => r.key === "resultadoLiquidacion")?.status).toBe("match");
  });

  it("flags a mismatch beyond tolerance", () => {
    const extracted: ModeloFields = { ...emptyFields, ivaDevengado: 250, ivaDeducible: 21 };
    const rows = buildModeloReport("303", snapshot, extracted, {
      ...period,
      detectedYear: 2026,
      detectedQuarter: 3,
    });
    expect(rows.find((r) => r.key === "ivaDevengado")).toMatchObject({
      expected: 210,
      extracted: 250,
      status: "mismatch",
    });
  });

  it("flags a field the extractor found nothing for as missing, not a false mismatch", () => {
    const rows = buildModeloReport("303", snapshot, emptyFields, {
      ...period,
      detectedYear: 2026,
      detectedQuarter: 3,
    });
    expect(rows.find((r) => r.key === "ivaDevengado")).toMatchObject({ extracted: null, status: "missing" });
  });

  it("flags a period mismatch without blocking the rest of the report", () => {
    const rows = buildModeloReport("303", snapshot, emptyFields, {
      ...period,
      detectedYear: 2026,
      detectedQuarter: 1,
    });
    expect(rows.find((r) => r.key === "period")?.status).toBe("mismatch");
  });

  it("flags an undetected period as a mismatch", () => {
    const rows = buildModeloReport("303", snapshot, emptyFields, {
      ...period,
      detectedYear: null,
      detectedQuarter: null,
    });
    expect(rows.find((r) => r.key === "period")).toMatchObject({ extracted: null, status: "mismatch" });
  });
});

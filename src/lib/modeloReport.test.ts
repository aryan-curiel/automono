import { describe, expect, it } from "vitest";
import { buildDeclarationSnapshot } from "./quarterlyDeclaration";
import {
  buildModeloReport,
  cumulativeModelo130,
  DEFAULT_GDJ_RATE,
  expectedCasillas,
  type ModeloFields,
} from "./modeloReport";
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
    ivaDeductiblePct: null,
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
      {
        key: "resultadoLiquidacion",
        label: "Resultado (antes de compensación de periodos anteriores)",
        expected: 189,
        informational: true,
      },
    ]);
  });

  it("130 rows come from the cumulative ytd result when provided", () => {
    const snapshot = buildDeclarationSnapshot([invoice({ subtotal: 1000 })], []);
    const ytd130 = {
      rendimientoNetoYtd: 12345,
      gastosDificilJustificacion: 617,
      priorPagosFraccionados: 100,
      pagoFraccionado: 321,
    };
    const rows = expectedCasillas("130", snapshot, ytd130);
    expect(rows).toEqual([
      { key: "rendimientoNeto", label: "Rendimiento neto (acumulado)", expected: 12345 },
      { key: "pagoFraccionado", label: "Pago fraccionado", expected: 321 },
    ]);
  });

  it("130 falls back to the isolated-quarter estimate with no ytd result", () => {
    const snapshot = buildDeclarationSnapshot(
      [invoice({ subtotal: 1000, irpfAmount: 250 })],
      [expense({ amount: 200, deductiblePct: 100 })],
    );
    // netIrpfIncome = 800; 20% = 160; minus irpfWithheld 250 -> negative, clamped to 0
    const rows = expectedCasillas("130", snapshot);
    expect(rows.find((r) => r.key === "pagoFraccionado")?.expected).toBe(0);
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

describe("cumulativeModelo130", () => {
  it("Q1: 20% of (YTD net − GDJ) minus retenciones", () => {
    const r = cumulativeModelo130(
      [invoice({ issueDate: "2026-02-01", subtotal: 10000, irpfAmount: 1500 })],
      [expense({ date: "2026-02-01", amount: 2000, deductiblePct: 100 })],
      2026,
      1,
      5,
    );
    // net 8000; GDJ = 5% * 8000 = 400; base 7600; 0.2*7600 = 1520; − ret 1500 − prior 0 = 20
    expect(r.rendimientoNetoYtd).toBe(8000);
    expect(r.gastosDificilJustificacion).toBe(400);
    expect(r.priorPagosFraccionados).toBe(0);
    expect(r.pagoFraccionado).toBe(20);
  });

  it("Q2: YTD figures and prior quarter's positive pago are subtracted", () => {
    const invoices = [
      invoice({ id: 1, issueDate: "2026-02-01", subtotal: 10000, irpfAmount: 1500 }),
      invoice({ id: 2, issueDate: "2026-05-01", subtotal: 10000, irpfAmount: 1500 }),
    ];
    const expenses = [
      expense({ id: 1, date: "2026-02-01", amount: 2000, deductiblePct: 100 }),
      expense({ id: 2, date: "2026-05-01", amount: 2000, deductiblePct: 100 }),
    ];
    const r = cumulativeModelo130(invoices, expenses, 2026, 2, 5);
    // YTD net 16000; GDJ 800; base 15200; 0.2*15200 = 3040; − retYTD 3000 − priorPago(Q1=20) = 20
    expect(r.rendimientoNetoYtd).toBe(16000);
    expect(r.priorPagosFraccionados).toBe(20);
    expect(r.pagoFraccionado).toBe(20);
  });

  it("negative quarter result floors at 0 and does not create a negative prior pago", () => {
    const invoices = [
      invoice({ id: 1, issueDate: "2026-02-01", subtotal: 1000, irpfAmount: 250 }),
      invoice({ id: 2, issueDate: "2026-05-01", subtotal: 20000, irpfAmount: 0 }),
    ];
    const r = cumulativeModelo130(invoices, [], 2026, 2, 5);
    // Q1 net 1000, 0.2*(950) = 190 − 250 -> 0 (priorPagos stays 0)
    // Q2 YTD net 21000, GDJ 1050, 0.2*19950 = 3990 − 250 − 0 = 3740
    expect(r.priorPagosFraccionados).toBe(0);
    expect(r.pagoFraccionado).toBe(3740);
  });

  it("GDJ reduction is capped at €2,000/yr", () => {
    const r = cumulativeModelo130(
      [invoice({ issueDate: "2026-02-01", subtotal: 200000, irpfAmount: 0 })],
      [],
      2026,
      1,
      5,
    );
    expect(r.gastosDificilJustificacion).toBe(2000); // 5% * 200000 = 10000, capped
  });

  it("DEFAULT_GDJ_RATE is 5", () => {
    expect(DEFAULT_GDJ_RATE).toBe(5);
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
    // resultadoLiquidacion is informational — AutoMono can't compute prior-period compensation, so
    // it's shown for reference and never compared against the filed figure.
    expect(rows.find((r) => r.key === "resultadoLiquidacion")).toMatchObject({
      extracted: 189.01,
      status: "info",
    });
  });

  it("never flags the 303 resultado as a mismatch even when the filed figure differs wildly", () => {
    const extracted: ModeloFields = { ...emptyFields, resultadoLiquidacion: 5000 };
    const rows = buildModeloReport("303", snapshot, extracted, {
      ...period,
      detectedYear: 2026,
      detectedQuarter: 3,
    });
    expect(rows.find((r) => r.key === "resultadoLiquidacion")?.status).toBe("info");
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
    expect(rows.find((r) => r.key === "ivaDevengado")).toMatchObject({
      extracted: null,
      status: "missing",
    });
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
    expect(rows.find((r) => r.key === "period")).toMatchObject({
      extracted: null,
      status: "mismatch",
    });
  });
});

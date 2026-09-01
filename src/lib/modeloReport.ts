import type { InvoiceListItem } from "../db/invoices";
import type { ExpenseRecord } from "../db/expenses";
import {
  buildDeclarationSnapshot,
  expensesInPeriod,
  invoicesInPeriod,
  type DeclarationSnapshot,
} from "./quarterlyDeclaration";
import { quarterRange } from "./dateRange";
import { roundCents as round2 } from "./invoice";

export type Modelo = "303" | "130" | "111";

/** Extracted headline figures from an uploaded modelo PDF — mirrors the Rust `ModeloFields`
 * struct in `modelo_review.rs`. Every field is modelo-specific; a 303 file only ever populates
 * the `iva*` fields, a 130 only `rendimientoNeto`/`pagoFraccionado`, a 111 only the retention pair. */
export interface ModeloFields {
  ivaDevengado: number | null;
  ivaDeducible: number | null;
  resultadoLiquidacion: number | null;
  rendimientoNeto: number | null;
  pagoFraccionado: number | null;
  baseRetenciones: number | null;
  retencionesIngresadas: number | null;
}

export interface CasillaExpectation {
  key: keyof ModeloFields;
  label: string;
  expected: number;
}

/** A rounding tolerance wider than plain float error, since real receipts/invoices are rounded
 * to the cent independently of AutoMono's own float math. */
const TOLERANCE = 0.02;

/** 5% is the estimación directa simplificada default; kept in sync with the SQL column default
 *  in `0033_declaration_gdj_rate.sql`. */
export const DEFAULT_GDJ_RATE = 5;
/** Annual ceiling on the "gastos de difícil justificación" reduction (€). */
export const GDJ_ANNUAL_CAP = 2000;

export interface Modelo130Ytd {
  /** AEAT box [03]: ingresos YTD − gastos deducibles YTD (accrual). */
  rendimientoNetoYtd: number;
  /** The "gastos de difícil justificación" reduction actually applied YTD (after the cap). */
  gastosDificilJustificacion: number;
  /** Sum of prior quarters' own positive pagos fraccionados. */
  priorPagosFraccionados: number;
  /** This quarter's box result: max(0, 0.2·([03] − GDJ) − retencionesYTD − priorPagos). */
  pagoFraccionado: number;
}

/**
 * Real Modelo 130 box logic, recomputed cumulatively across Q1..`quarter` of `year` from the
 * (accrual) invoice/expense records. `gdjRatePct` (the focused declaration's rate) is applied
 * uniformly YTD — GDJ is a year-to-date figure at the year's régimen rate.
 *
 * ponytail: recompute-from-raw instead of persisting per-quarter declared figures — prior pagos
 * are AutoMono's own consistent recomputation, not the values actually filed. Revisit if the app
 * ever needs to reconcile against real prior filings.
 */
export function cumulativeModelo130(
  invoices: InvoiceListItem[],
  expenses: ExpenseRecord[],
  year: number,
  quarter: 1 | 2 | 3 | 4,
  gdjRatePct: number,
): Modelo130Ytd {
  const yearStart = quarterRange(year, 1).from;
  let priorPagos = 0;
  let out: Modelo130Ytd = {
    rendimientoNetoYtd: 0,
    gastosDificilJustificacion: 0,
    priorPagosFraccionados: 0,
    pagoFraccionado: 0,
  };

  for (let q = 1; q <= quarter; q++) {
    const ytd = { from: yearStart, to: quarterRange(year, q as 1 | 2 | 3 | 4).to, label: "" };
    const snap = buildDeclarationSnapshot(
      invoicesInPeriod(invoices, ytd),
      expensesInPeriod(expenses, ytd),
    );
    const netYtd = snap.totals.netIrpfIncome;
    const retYtd = snap.totals.irpfWithheld;
    const gdj = Math.min(GDJ_ANNUAL_CAP, round2((gdjRatePct / 100) * Math.max(0, netYtd)));
    const pago = Math.max(0, round2(0.2 * (netYtd - gdj) - retYtd - priorPagos));
    out = {
      rendimientoNetoYtd: netYtd,
      gastosDificilJustificacion: gdj,
      priorPagosFraccionados: priorPagos,
      pagoFraccionado: pago,
    };
    if (q < quarter) priorPagos = round2(priorPagos + pago);
  }
  return out;
}

/**
 * AutoMono's own calculated value for every AEAT box the app can actually compute, per modelo.
 * Only the boxes backed by data AutoMono tracks are listed here — this is a deliberate ceiling,
 * not an oversight: extend this per-modelo list if a specific box needs comparing later.
 */
export function expectedCasillas(modelo: Modelo, snapshot: DeclarationSnapshot): CasillaExpectation[] {
  const { totals, expenses } = snapshot;
  switch (modelo) {
    case "303": {
      const ivaDevengado = totals.ivaByRate.reduce((s, r) => s + r.iva, 0);
      const ivaDeducible = totals.expensesIvaDeductible;
      return [
        { key: "ivaDevengado", label: "IVA devengado", expected: round2(ivaDevengado) },
        { key: "ivaDeducible", label: "IVA deducible", expected: round2(ivaDeducible) },
        {
          key: "resultadoLiquidacion",
          label: "Resultado de la liquidación",
          expected: round2(ivaDevengado - ivaDeducible),
        },
      ];
    }
    case "130": {
      // ponytail: per-quarter approximation only (20% of this quarter's rendimiento neto minus
      // retenciones already practiced this quarter). The official Modelo 130 formula is
      // cumulative across the whole tax year (also subtracting prior quarters' own pagos
      // fraccionados) — add that once declarations track year-to-date state, not just a single
      // quarter's snapshot.
      const pagoFraccionado = Math.max(0, totals.netIrpfIncome * 0.2 - totals.irpfWithheld);
      return [
        { key: "rendimientoNeto", label: "Rendimiento neto", expected: round2(totals.netIrpfIncome) },
        { key: "pagoFraccionado", label: "Pago fraccionado (20%)", expected: round2(pagoFraccionado) },
      ];
    }
    case "111": {
      const baseRetenciones = expenses
        .filter((e) => e.irpfAmount > 0)
        .reduce((s, e) => s + e.amount, 0);
      return [
        { key: "baseRetenciones", label: "Base de retenciones", expected: round2(baseRetenciones) },
        {
          key: "retencionesIngresadas",
          label: "Retenciones ingresadas",
          expected: round2(totals.expensesIrpfWithheld),
        },
      ];
    }
  }
}

export type CasillaStatus = "match" | "mismatch" | "missing";

export interface ModeloReportRow {
  key: string;
  label: string;
  expected: number | null;
  extracted: number | null;
  status: CasillaStatus;
}

export interface PeriodCheck {
  expectedYear: number;
  expectedQuarter: number;
  detectedYear: number | null;
  detectedQuarter: number | null;
}

/** Pairs AutoMono's calculated values against the modelo PDF's own extracted figures, plus a
 * leading row for the year/quarter match — every row is informational, only "modelo not
 * recognized at all" is a hard block (enforced earlier, at detection time). */
export function buildModeloReport(
  modelo: Modelo,
  snapshot: DeclarationSnapshot,
  extracted: ModeloFields,
  period: PeriodCheck,
): ModeloReportRow[] {
  const periodMatches =
    period.detectedYear !== null &&
    period.detectedQuarter !== null &&
    period.detectedYear === period.expectedYear &&
    period.detectedQuarter === period.expectedQuarter;
  const periodRow: ModeloReportRow = {
    key: "period",
    label: "Ejercicio / trimestre",
    expected: period.expectedYear * 10 + period.expectedQuarter,
    extracted:
      period.detectedYear !== null && period.detectedQuarter !== null
        ? period.detectedYear * 10 + period.detectedQuarter
        : null,
    status: periodMatches ? "match" : "mismatch",
  };

  const casillaRows = expectedCasillas(modelo, snapshot).map((c): ModeloReportRow => {
    const value = extracted[c.key];
    if (value === null) {
      return { key: c.key, label: c.label, expected: c.expected, extracted: null, status: "missing" };
    }
    const status: CasillaStatus = Math.abs(value - c.expected) <= TOLERANCE ? "match" : "mismatch";
    return { key: c.key, label: c.label, expected: c.expected, extracted: value, status };
  });

  return [periodRow, ...casillaRows];
}

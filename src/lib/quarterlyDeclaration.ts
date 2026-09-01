import type { InvoiceListItem } from "../db/invoices";
import type { ExpenseRecord } from "../db/expenses";
import { quartersInRange, type Period } from "./dateRange";
import { csvRow } from "./csv";
import { formatDate } from "./format";
import { roundCents } from "./invoice";

/** Invoices issued or paid (never drafts) with an issue date inside `period`. */
export function invoicesInPeriod(invoices: InvoiceListItem[], period: Period): InvoiceListItem[] {
  return invoices.filter(
    (inv) =>
      inv.status !== "draft" &&
      inv.issueDate !== null &&
      inv.issueDate >= period.from &&
      inv.issueDate <= period.to,
  );
}

/** Invoices actually paid (collected), with an issue date inside `period` — narrower than
 * `invoicesInPeriod`, used for the declaration wizard where only money received counts. */
export function paidInvoicesInPeriod(
  invoices: InvoiceListItem[],
  period: Period,
): InvoiceListItem[] {
  return invoices.filter(
    (inv) =>
      inv.status === "paid" &&
      inv.issueDate !== null &&
      inv.issueDate >= period.from &&
      inv.issueDate <= period.to,
  );
}

/** Expenses belonging to `period`: dated inside it with no override, or explicitly overridden
 * (via `declaredPeriod`) into one of the quarters `period` spans — mirrors `listExpenses`'
 * `quarterKeys` SQL filter, so callers that already have the full expense list in memory (e.g.
 * computing several declarations' snapshots at once) don't need a per-declaration query. */
export function expensesInPeriod(expenses: ExpenseRecord[], period: Period): ExpenseRecord[] {
  const quarterKeys = quartersInRange(period.from, period.to);
  return expenses.filter((e) =>
    e.declaredPeriod == null
      ? e.date >= period.from && e.date <= period.to
      : quarterKeys.includes(e.declaredPeriod),
  );
}

export interface DeclarationInvoiceLine {
  id: number;
  number: string;
  clientName: string;
  issueDate: string;
  base: number;
  ivaRate: number;
  ivaAmount: number;
  irpfRate: number;
  irpfAmount: number;
  total: number;
  pdfPath: string | null;
}

export interface DeclarationExpenseLine {
  id: number;
  date: string;
  description: string | null;
  category: string | null;
  amount: number;
  deductiblePct: number;
  ivaAmount: number;
  irpfRate: number;
  irpfAmount: number;
  receiptFilePath: string | null;
}

export interface DeclarationTotals {
  invoicedBase: number;
  ivaByRate: { rate: number; base: number; iva: number }[];
  irpfWithheld: number;
  expensesDeductibleBase: number;
  expensesIvaDeductible: number;
  expensesIrpfWithheld: number;
  netIrpfIncome: number;
  margin: number;
}

export interface DeclarationSnapshot {
  invoices: DeclarationInvoiceLine[];
  expenses: DeclarationExpenseLine[];
  totals: DeclarationTotals;
}

/**
 * Computes the Modelo 130/303 helper totals (invoiced base, IVA by rate, IRPF, deductible
 * expenses) from an already-filtered invoice/expense set. Used both for the live
 * `ResumenTrimestral` KPIs and to freeze a `QuarterlyDeclaration` snapshot — one source of truth
 * for the tax math so the two never drift apart.
 */
export function buildDeclarationSnapshot(
  invoices: InvoiceListItem[],
  expenses: ExpenseRecord[],
): DeclarationSnapshot {
  const byRate = new Map<number, { base: number; iva: number }>();
  invoices.forEach((inv) => {
    const bucket = byRate.get(inv.ivaRate) ?? { base: 0, iva: 0 };
    bucket.base += inv.subtotal;
    bucket.iva += inv.ivaAmount;
    byRate.set(inv.ivaRate, bucket);
  });

  const invoicedBase = roundCents(invoices.reduce((s, inv) => s + inv.subtotal, 0));
  const irpfWithheld = roundCents(invoices.reduce((s, inv) => s + inv.irpfAmount, 0));
  const expensesDeductibleBase = roundCents(
    expenses.reduce((s, e) => s + e.amount * (e.deductiblePct / 100), 0),
  );
  const expensesIvaDeductible = roundCents(
    expenses.reduce((s, e) => s + (e.ivaAmount ?? 0) * (e.deductiblePct / 100), 0),
  );
  const expensesIrpfWithheld = roundCents(expenses.reduce((s, e) => s + (e.irpfAmount ?? 0), 0));
  const netIrpfIncome = roundCents(invoicedBase - expensesDeductibleBase);
  const margin = roundCents(netIrpfIncome - irpfWithheld);

  return {
    invoices: invoices.map((inv) => ({
      id: inv.id,
      number:
        inv.seriesPrefix && inv.invoiceNumber ? `${inv.seriesPrefix}-${inv.invoiceNumber}` : "",
      clientName: inv.clientName,
      issueDate: inv.issueDate ?? "",
      base: inv.subtotal,
      ivaRate: inv.ivaRate,
      ivaAmount: inv.ivaAmount,
      irpfRate: inv.irpfRate,
      irpfAmount: inv.irpfAmount,
      total: inv.total,
      pdfPath: inv.pdfPath,
    })),
    expenses: expenses.map((e) => ({
      id: e.id,
      date: e.date,
      description: e.description,
      category: e.category,
      amount: e.amount,
      deductiblePct: e.deductiblePct,
      ivaAmount: e.ivaAmount ?? 0,
      irpfRate: e.irpfRate ?? 0,
      irpfAmount: e.irpfAmount ?? 0,
      receiptFilePath: e.receiptFilePath,
    })),
    totals: {
      invoicedBase,
      ivaByRate: [...byRate.entries()].map(([rate, { base, iva }]) => ({
        rate,
        base: roundCents(base),
        iva: roundCents(iva),
      })),
      irpfWithheld,
      expensesDeductibleBase,
      expensesIvaDeductible,
      expensesIrpfWithheld,
      netIrpfIncome,
      margin,
    },
  };
}

/** CSV export (Facturas + Gastos sections) for a declaration snapshot — used by both the live
 * `ResumenTrimestral` export and the locked declaration's zip download. */
export function buildDeclarationCsv(snapshot: DeclarationSnapshot): string {
  const lines: string[] = [];

  lines.push(csvRow(["Facturas"]));
  lines.push(
    csvRow(["Fecha", "Nº factura", "Cliente", "Base", "% IVA", "IVA", "% IRPF", "IRPF", "Total"]),
  );
  for (const inv of snapshot.invoices) {
    lines.push(
      csvRow([
        formatDate(inv.issueDate),
        inv.number,
        inv.clientName,
        inv.base,
        inv.ivaRate,
        inv.ivaAmount,
        inv.irpfRate,
        inv.irpfAmount,
        inv.total,
      ]),
    );
  }

  lines.push("");

  lines.push(csvRow(["Gastos"]));
  lines.push(
    csvRow([
      "Fecha",
      "Categoría",
      "Descripción",
      "Importe",
      "IVA",
      "% deducible",
      "% IRPF",
      "IRPF",
    ]),
  );
  for (const e of snapshot.expenses) {
    lines.push(
      csvRow([
        formatDate(e.date),
        e.category ?? "",
        e.description ?? "",
        e.amount,
        e.ivaAmount,
        e.deductiblePct,
        e.irpfRate,
        e.irpfAmount,
      ]),
    );
  }

  return lines.join("\n");
}

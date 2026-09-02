import type { InvoiceListItem } from "../db/invoices";
import type { ExpenseRecord } from "../db/expenses";
import { yearRange } from "./dateRange";
import { roundCents } from "./invoice";
import {
  buildDeclarationSnapshot,
  expensesInPeriod,
  invoicesInPeriod,
} from "./quarterlyDeclaration";
import { expenseByCategory, yoyDelta, type CategoryExpense } from "./analytics";

/** Full-year figures for one calendar year, all excluding IVA and on the accrual (devengo)
 * basis — the same math the quarterly declaration uses, just over a 12-month period. */
export interface AnnualTotals {
  year: number;
  /** Net invoiced base (non-draft invoices issued in the year), IVA excluded. */
  revenue: number;
  /** Deductible expense base for the year. */
  expenses: number;
  /** revenue − expenses (the rough rendimiento neto). */
  net: number;
}

export function annualTotals(
  invoices: InvoiceListItem[],
  expenses: ExpenseRecord[],
  year: number,
): AnnualTotals {
  const period = yearRange(year);
  const snap = buildDeclarationSnapshot(
    invoicesInPeriod(invoices, period),
    expensesInPeriod(expenses, period),
  );
  return {
    year,
    revenue: snap.totals.invoicedBase,
    expenses: snap.totals.expensesDeductibleBase,
    net: snap.totals.netIrpfIncome,
  };
}

export interface AnnualTotalsRow extends AnnualTotals {
  /** % change of `revenue` vs the previous year in the list; null for the first row. */
  revenueYoY: number | null;
  /** % change of `net` vs the previous year in the list; null for the first row. */
  netYoY: number | null;
}

/** One `AnnualTotals` per year (ascending), each with a year-over-year delta against its
 * predecessor in the list. Used by the multi-year revenue dashboard. */
export function multiYearSummary(
  invoices: InvoiceListItem[],
  expenses: ExpenseRecord[],
  years: number[],
): AnnualTotalsRow[] {
  const sorted = [...years].sort((a, b) => a - b);
  const totals = sorted.map((y) => annualTotals(invoices, expenses, y));
  return totals.map((t, i) => ({
    ...t,
    revenueYoY: i > 0 ? yoyDelta(t.revenue, totals[i - 1].revenue) : null,
    netYoY: i > 0 ? yoyDelta(t.net, totals[i - 1].net) : null,
  }));
}

export interface ClientRevenueBase {
  clientName: string;
  base: number;
}

/** A single-year profit & loss statement: revenue broken out by client, expenses by category,
 * and the resulting net. All figures IVA-excluded, accrual basis. */
export interface AnnualPnl {
  year: number;
  byClient: ClientRevenueBase[];
  byCategory: CategoryExpense[];
  totalRevenue: number;
  totalExpenses: number;
  net: number;
}

export function annualPnl(
  invoices: InvoiceListItem[],
  expenses: ExpenseRecord[],
  year: number,
): AnnualPnl {
  const period = yearRange(year);
  const periodInvoices = invoicesInPeriod(invoices, period);
  const periodExpenses = expensesInPeriod(expenses, period);
  const snap = buildDeclarationSnapshot(periodInvoices, periodExpenses);

  const byClientMap = new Map<string, number>();
  for (const line of snap.invoices) {
    byClientMap.set(line.clientName, (byClientMap.get(line.clientName) ?? 0) + line.base);
  }
  const byClient = [...byClientMap.entries()]
    .map(([clientName, base]) => ({ clientName, base: roundCents(base) }))
    .sort((a, b) => b.base - a.base);

  return {
    year,
    byClient,
    byCategory: expenseByCategory(periodExpenses),
    totalRevenue: snap.totals.invoicedBase,
    totalExpenses: snap.totals.expensesDeductibleBase,
    net: snap.totals.netIrpfIncome,
  };
}

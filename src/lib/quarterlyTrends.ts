import type { InvoiceListItem } from "../db/invoices";
import type { ExpenseRecord } from "../db/expenses";
import { ivaDeductiblePctOf } from "../db/expenses";
import {
  previousQuarterKey,
  quarterKeyLabel,
  quarterKeyOf,
  quarterRange,
} from "./dateRange";
import type { Period } from "./dateRange";
import { invoicesInPeriod, paidInvoicesInPeriod } from "./quarterlyDeclaration";
import { expenseByCategory } from "./analytics";

/** The [from, to] date range of a "YYYY-QN" quarter key. */
function quarterKeyRange(key: string): Period {
  const [yearStr, q] = key.split("-Q");
  return quarterRange(Number(yearStr), Number(q) as 1 | 2 | 3 | 4);
}

/** `count` quarter keys ending at `currentKey`, ascending (oldest first). */
export function recentQuarterKeys(currentKey: string, count: number): string[] {
  const keys = [currentKey];
  for (let i = 1; i < count; i++) keys.unshift(previousQuarterKey(keys[0]));
  return keys;
}

/** The quarter an expense counts toward — its own date's quarter, unless overridden. Mirrors
 * the OR-match `listExpenses({ quarterKeys })` applies server-side. */
function expenseQuarterKey(expense: ExpenseRecord): string {
  return expense.declaredPeriod ?? quarterKeyOf(expense.date);
}

export interface QuarterBarDatum {
  key: string;
  label: string;
  value: number;
}

export interface StackedQuarterBarDatum {
  key: string;
  label: string;
  a: number;
  b: number;
}

export interface QuarterlyTrends {
  quarterKeys: string[];
  /** Net IVA (invoiced − deductible) per quarter — accrual projection, includes unpaid invoices. */
  ivaTrendData: QuarterBarDatum[];
  /** Gross invoiced split into paid (`a`) vs still-outstanding (`b`) per quarter. */
  paidPendingData: StackedQuarterBarDatum[];
  /** The single largest expense category across the whole window, or undefined if no expenses. */
  topExpenseCategory: string | undefined;
  /** Deductible spend on `topExpenseCategory` per quarter. */
  categoryTrendData: QuarterBarDatum[];
}

/**
 * The three rolling-window trend series the Inicio screen used to show under "Analytics",
 * moved here verbatim so they can be hosted on ResumenTrimestral. `expenses` must already be
 * the set covering `count` quarters ending at `currentKey` (same OR-match filter as
 * `listExpenses({ from, to, quarterKeys })`).
 */
export function quarterlyTrendData(
  invoices: InvoiceListItem[],
  expenses: ExpenseRecord[],
  currentKey: string,
  count: number,
): QuarterlyTrends {
  const quarterKeys = recentQuarterKeys(currentKey, count);

  const ivaInvoicedByQuarter = new Map(
    quarterKeys.map((key) => {
      const total = invoicesInPeriod(invoices, quarterKeyRange(key)).reduce(
        (s, inv) => s + inv.ivaAmount,
        0,
      );
      return [key, total] as const;
    }),
  );
  const ivaDeductibleByQuarter = new Map(quarterKeys.map((key) => [key, 0] as [string, number]));
  for (const expense of expenses) {
    const key = expenseQuarterKey(expense);
    if (ivaDeductibleByQuarter.has(key)) {
      ivaDeductibleByQuarter.set(
        key,
        ivaDeductibleByQuarter.get(key)! +
          (expense.ivaAmount ?? 0) * (ivaDeductiblePctOf(expense) / 100),
      );
    }
  }
  const ivaTrendData = quarterKeys.map((key) => ({
    key,
    label: quarterKeyLabel(key),
    value: (ivaInvoicedByQuarter.get(key) ?? 0) - (ivaDeductibleByQuarter.get(key) ?? 0),
  }));

  const grossInvoicedByQuarter = new Map(
    quarterKeys.map((key) => {
      const total = invoicesInPeriod(invoices, quarterKeyRange(key)).reduce(
        (s, inv) => s + inv.total,
        0,
      );
      return [key, total] as const;
    }),
  );
  const paidByQuarter = new Map(
    quarterKeys.map((key) => {
      const total = paidInvoicesInPeriod(invoices, quarterKeyRange(key)).reduce(
        (s, inv) => s + inv.total,
        0,
      );
      return [key, total] as const;
    }),
  );
  const paidPendingData = quarterKeys.map((key) => {
    const total = grossInvoicedByQuarter.get(key) ?? 0;
    const paid = paidByQuarter.get(key) ?? 0;
    return { key, label: quarterKeyLabel(key), a: paid, b: Math.max(0, total - paid) };
  });

  const topExpenseCategory = expenseByCategory(expenses)[0]?.category;
  const categoryTrendByQuarter = new Map(
    quarterKeys.map((key) => {
      const total = expenses
        .filter(
          (e) =>
            expenseQuarterKey(e) === key &&
            (e.category?.trim() || "Sin categoría") === topExpenseCategory,
        )
        .reduce((s, e) => s + e.amount * (e.deductiblePct / 100), 0);
      return [key, total] as const;
    }),
  );
  const categoryTrendData = quarterKeys.map((key) => ({
    key,
    label: quarterKeyLabel(key),
    value: categoryTrendByQuarter.get(key) ?? 0,
  }));

  return { quarterKeys, ivaTrendData, paidPendingData, topExpenseCategory, categoryTrendData };
}

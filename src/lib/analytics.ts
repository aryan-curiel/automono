import type { InvoiceListItem } from "../db/invoices";
import type { ExpenseRecord } from "../db/expenses";
import { daysBetween } from "./dateRange";

export interface ClientRevenue {
  clientId: number;
  clientName: string;
  total: number;
}

/** Top clients by billed amount, descending. Excludes drafts (not yet billed). */
export function revenueByClient(invoices: InvoiceListItem[]): ClientRevenue[] {
  const byClient = new Map<number, ClientRevenue>();
  for (const inv of invoices) {
    if (inv.status === "draft") continue;
    const existing = byClient.get(inv.clientId);
    if (existing) existing.total += inv.total;
    else
      byClient.set(inv.clientId, {
        clientId: inv.clientId,
        clientName: inv.clientName,
        total: inv.total,
      });
  }
  return [...byClient.values()].sort((a, b) => b.total - a.total);
}

export interface CategoryExpense {
  category: string;
  total: number;
}

/** Expense totals grouped by category, descending. Blank/missing category becomes "Sin categoría". */
export function expenseByCategory(expenses: ExpenseRecord[]): CategoryExpense[] {
  const byCategory = new Map<string, number>();
  for (const e of expenses) {
    const key = e.category?.trim() || "Sin categoría";
    byCategory.set(key, (byCategory.get(key) ?? 0) + e.amount * (e.deductiblePct / 100));
  }
  return [...byCategory.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
}

export type AgingBucket = "current" | "0-30" | "30-60" | "60+";

export interface AgingGroup {
  bucket: AgingBucket;
  invoices: InvoiceListItem[];
  total: number;
}

const AGING_BUCKETS: AgingBucket[] = ["current", "0-30", "30-60", "60+"];

/** Outstanding (unpaid) amount on an invoice: total minus whatever's been received. */
export function outstandingAmount(inv: InvoiceListItem): number {
  return inv.total - (inv.amountPaid ?? 0);
}

/**
 * Groups issued invoices with money still owed by how overdue they are, relative to `todayIso`.
 * Buckets: `current` (not due yet), `0-30` (1–30 days late), `30-60` (31–60), `60+`.
 * `total` per group is the sum of *outstanding* amounts, so a partially-paid invoice only
 * counts for what's left. Fully-paid invoices drop out even if their status hasn't flipped.
 */
export function agingReport(invoices: InvoiceListItem[], todayIso: string): AgingGroup[] {
  const grouped: Record<AgingBucket, InvoiceListItem[]> = {
    current: [],
    "0-30": [],
    "30-60": [],
    "60+": [],
  };
  for (const inv of invoices) {
    if (inv.status !== "issued" || !inv.dueDate) continue;
    if (outstandingAmount(inv) <= 0.005) continue;
    const overdue = daysBetween(inv.dueDate, todayIso);
    const bucket: AgingBucket =
      overdue <= 0 ? "current" : overdue <= 30 ? "0-30" : overdue <= 60 ? "30-60" : "60+";
    grouped[bucket].push(inv);
  }
  return AGING_BUCKETS.map((bucket) => ({
    bucket,
    invoices: grouped[bucket],
    total: grouped[bucket].reduce((s, i) => s + outstandingAmount(i), 0),
  }));
}

/** Percentage change of `current` vs `prior`. Null when `prior` is 0 (growth is undefined). */
export function yoyDelta(current: number, prior: number): number | null {
  if (prior === 0) return null;
  return ((current - prior) / prior) * 100;
}

export interface ClientBalance {
  invoiced: number;
  paid: number;
  outstanding: number;
}

/** Total invoiced (issued + paid, excludes drafts) vs. total paid for one client. */
export function clientBalance(invoices: InvoiceListItem[], clientId: number): ClientBalance {
  const clientInvoices = invoices.filter(
    (inv) => inv.clientId === clientId && inv.status !== "draft",
  );
  const invoiced = clientInvoices.reduce((s, inv) => s + inv.total, 0);
  const paid = clientInvoices
    .filter((inv) => inv.status === "paid")
    .reduce((s, inv) => s + inv.total, 0);
  return { invoiced, paid, outstanding: invoiced - paid };
}

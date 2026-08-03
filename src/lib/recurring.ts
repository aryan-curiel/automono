import type { InvoiceListItem } from "../db/invoices";

export interface RecurringCandidate {
  clientId: number;
  clientName: string;
  lastInvoiceId: number;
  lastInvoiceTotal: number;
}

function monthPrefix(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * Clients invoiced last calendar month but not yet this one — a stand-in for "on a monthly
 * retainer" without a dedicated billing-frequency field: reuses `duplicateInvoice`'s existing
 * line-item copy rather than adding new recurrence data. Drafts (no `issueDate` yet) don't
 * count for either month, so a pending-but-unissued draft this month can still surface a
 * duplicate suggestion — a harmless corner, the user just ignores or discards the extra draft.
 */
export function recurringInvoiceCandidates(
  invoices: InvoiceListItem[],
  todayIso: string,
): RecurringCandidate[] {
  const [year, month] = todayIso.split("-").map(Number);
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const thisMonthPrefix = monthPrefix(year, month);
  const prevMonthPrefix = monthPrefix(prevYear, prevMonth);

  const issued = invoices.filter((inv) => inv.status !== "draft" && inv.issueDate !== null);
  const invoicedThisMonth = new Set(
    issued.filter((inv) => inv.issueDate!.startsWith(thisMonthPrefix)).map((inv) => inv.clientId),
  );

  const lastMonthByClient = new Map<number, InvoiceListItem>();
  for (const inv of issued) {
    if (!inv.issueDate!.startsWith(prevMonthPrefix)) continue;
    const existing = lastMonthByClient.get(inv.clientId);
    if (!existing || inv.issueDate! > existing.issueDate!) lastMonthByClient.set(inv.clientId, inv);
  }

  return [...lastMonthByClient.values()]
    .filter((inv) => !invoicedThisMonth.has(inv.clientId))
    .map((inv) => ({
      clientId: inv.clientId,
      clientName: inv.clientName,
      lastInvoiceId: inv.id,
      lastInvoiceTotal: inv.total,
    }));
}

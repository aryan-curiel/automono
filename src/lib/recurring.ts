import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { duplicateInvoice, listInvoices, type InvoiceListItem } from "../db/invoices";
import { claimNextInvoiceDate, listContracts, type ContractRecord } from "../db/contracts";
import type { BillingCadence } from "../types";
import i18n from "../i18n";

export const BILLING_CADENCES: readonly BillingCadence[] = [
  "none",
  "monthly",
  "quarterly",
  "yearly",
];

type ActiveCadence = Exclude<BillingCadence, "none">;

const CADENCE_MONTHS: Record<ActiveCadence, number> = { monthly: 1, quarterly: 3, yearly: 12 };

/**
 * Advance an ISO (`YYYY-MM-DD`) date by one cadence interval, clamping the day to the target
 * month's length so a 31st anchor lands on the 28th/30th rather than spilling into next month.
 */
export function nextBillingDate(dateIso: string, cadence: ActiveCadence): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const monthIndex = m - 1 + CADENCE_MONTHS[cadence];
  const year = y + Math.floor(monthIndex / 12);
  const month = ((monthIndex % 12) + 12) % 12;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(d, daysInMonth);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export interface RecurringCandidate {
  clientId: number;
  clientName: string;
  lastInvoiceId: number;
  lastInvoiceTotal: number;
  /** The date the next invoice is due for cadence-contract candidates; `null` for the heuristic. */
  dueDate: string | null;
}

function monthPrefix(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Most recent issued (non-draft, dated) invoice per client — the template `duplicateInvoice` clones. */
function latestIssuedByClient(invoices: InvoiceListItem[]): Map<number, InvoiceListItem> {
  const map = new Map<number, InvoiceListItem>();
  for (const inv of invoices) {
    if (inv.status === "draft" || inv.issueDate === null) continue;
    const current = map.get(inv.clientId);
    if (!current || inv.issueDate > current.issueDate!) map.set(inv.clientId, inv);
  }
  return map;
}

/**
 * True if the client already has an invoice — drafts included — dated on/after `sinceIso`, i.e. the
 * period was already drafted (by the startup run or by hand) and must not be drafted again.
 */
function hasInvoiceSince(invoices: InvoiceListItem[], clientId: number, sinceIso: string): boolean {
  return invoices.some(
    (inv) => inv.clientId === clientId && inv.issueDate !== null && inv.issueDate >= sinceIso,
  );
}

/**
 * Clients invoiced last calendar month but not yet this one — the pre-cadence heuristic, kept as a
 * fallback for clients with no active billing-cadence contract. Drafts (no `issueDate`) don't count
 * for either month.
 */
function heuristicCandidates(invoices: InvoiceListItem[], todayIso: string): RecurringCandidate[] {
  const [year, month] = todayIso.split("-").map(Number);
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const thisMonthPrefix = monthPrefix(year, month);
  const prevMonthPrefix = monthPrefix(prevYear, prevMonth);

  const issued = invoices.filter((inv) => inv.status !== "draft" && inv.issueDate !== null);
  // Drafts dated this month count too, so a just-generated draft clears the suggestion.
  const invoicedThisMonth = new Set(
    invoices.filter((inv) => inv.issueDate?.startsWith(thisMonthPrefix)).map((inv) => inv.clientId),
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
      dueDate: null,
    }));
}

/**
 * Invoices worth drafting now: one per active contract whose billing cadence has come due (and whose
 * client has an issued invoice to clone), plus the legacy month-heuristic for any client not covered
 * by an active cadence contract.
 */
export function recurringInvoiceCandidates(
  invoices: InvoiceListItem[],
  contracts: ContractRecord[],
  todayIso: string,
): RecurringCandidate[] {
  const latest = latestIssuedByClient(invoices);
  const candidates: RecurringCandidate[] = [];
  const cadenceClients = new Set<number>();

  for (const contract of contracts) {
    if (contract.status !== "active" || contract.billingCadence === "none") continue;
    cadenceClients.add(contract.clientId);
    if (!contract.nextInvoiceDate || contract.nextInvoiceDate > todayIso) continue;
    if (hasInvoiceSince(invoices, contract.clientId, contract.nextInvoiceDate)) continue;
    const template = latest.get(contract.clientId);
    if (!template) continue;
    candidates.push({
      clientId: contract.clientId,
      clientName: template.clientName,
      lastInvoiceId: template.id,
      lastInvoiceTotal: template.total,
      dueDate: contract.nextInvoiceDate,
    });
  }

  for (const candidate of heuristicCandidates(invoices, todayIso)) {
    if (!cadenceClients.has(candidate.clientId)) candidates.push(candidate);
  }
  return candidates;
}

export interface RecurringDraftTask {
  contractId: number;
  /** Anchor read from the DB — the claim only succeeds if it is still this value. */
  currentNextDate: string;
  /** `null` when the period already has an invoice: only advance the anchor, don't draft. */
  templateInvoiceId: number | null;
  /** Where the contract's anchor moves after drafting — a future date, so the next run is a no-op. */
  newNextDate: string;
}

/**
 * Contracts due for an auto-drafted invoice: cadence set, `nextInvoiceDate <= today`, and a
 * clonable invoice on file. ponytail: if the app hasn't been opened for several periods this
 * still drafts only once and fast-forwards the anchor past today — no backfill of missed periods.
 */
export function dueRecurringDrafts(
  contracts: ContractRecord[],
  invoices: InvoiceListItem[],
  todayIso: string,
): RecurringDraftTask[] {
  const latest = latestIssuedByClient(invoices);
  const tasks: RecurringDraftTask[] = [];
  for (const contract of contracts) {
    if (contract.status !== "active" || contract.billingCadence === "none") continue;
    if (!contract.nextInvoiceDate || contract.nextInvoiceDate > todayIso) continue;
    const template = latest.get(contract.clientId);
    if (!template) continue;
    let next = contract.nextInvoiceDate;
    while (next <= todayIso) next = nextBillingDate(next, contract.billingCadence);
    const covered = hasInvoiceSince(invoices, contract.clientId, contract.nextInvoiceDate);
    tasks.push({
      contractId: contract.id,
      currentNextDate: contract.nextInvoiceDate,
      templateInvoiceId: covered ? null : template.id,
      newNextDate: next,
    });
  }
  return tasks;
}

/**
 * Startup task: for every contract whose billing cadence is due, clone the client's last invoice
 * into a fresh draft and advance the contract's anchor date, then fire one OS notification.
 * Immediate-only (Tauri can't schedule while closed) — runs on every app open, mirrors
 * `runFilingReminders`. Returns the number of drafts created.
 */
export async function runRecurringInvoices(): Promise<number> {
  const todayIso = new Date().toISOString().slice(0, 10);
  const [contracts, invoices] = await Promise.all([listContracts(), listInvoices()]);
  const tasks = dueRecurringDrafts(contracts, invoices, todayIso);

  // Claim the period first (compare-and-swap on the anchor) so overlapping runs — StrictMode's
  // double effect, a fast relaunch — can't both draft it.
  let drafted = 0;
  for (const task of tasks) {
    const claimed = await claimNextInvoiceDate(
      task.contractId,
      task.currentNextDate,
      task.newNextDate,
    );
    if (!claimed || task.templateInvoiceId === null) continue;
    await duplicateInvoice(task.templateInvoiceId);
    drafted++;
  }
  if (drafted === 0) return 0;

  let granted = await isPermissionGranted();
  if (!granted) granted = (await requestPermission()) === "granted";
  if (granted) {
    sendNotification({
      title: i18n.t("recurring.notifyTitle"),
      body: i18n.t("recurring.notifyBody", { count: drafted }),
    });
  }
  return drafted;
}

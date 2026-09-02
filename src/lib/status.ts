import type { Tone } from "../components/ui/Badge";
import type { ContractStatus, InvoiceStatus } from "../types";
import type { QuoteStatus } from "../db/quotes";

const QUOTE_TONES: Record<QuoteStatus, Tone> = {
  draft: "warning",
  sent: "info",
  accepted: "success",
  rejected: "danger",
  expired: "neutral",
  converted: "success",
};

export function quoteStatusMeta(status: QuoteStatus): { labelKey: string; tone: Tone } {
  return { labelKey: `quotes.status.${status}`, tone: QUOTE_TONES[status] };
}

export function invoiceStatusMeta(status: InvoiceStatus): { labelKey: string; tone: Tone } {
  if (status === "paid") return { labelKey: "invoices.status.paid", tone: "success" };
  if (status === "draft") return { labelKey: "invoices.status.draft", tone: "warning" };
  return { labelKey: "invoices.status.issued", tone: "info" };
}

export function contractStatusMeta(status: ContractStatus): { labelKey: string; tone: Tone } {
  if (status === "active") return { labelKey: "contracts.status.active", tone: "success" };
  if (status === "expired") return { labelKey: "contracts.status.expired", tone: "warning" };
  return { labelKey: "contracts.status.terminated", tone: "neutral" };
}

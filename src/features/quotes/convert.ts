import type { InvoiceLanguage } from "../../db/clients";
import type { DraftPatch, NewInvoiceLine } from "../../db/invoices";

interface QuoteTaxShape {
  ivaRate: number;
  irpfRate: number | null;
  language: InvoiceLanguage;
}

interface QuoteLineShape {
  description: string;
  quantity: number;
  unitPrice: number;
}

/** Maps an accepted quote + its lines onto the shape `saveDraft()` expects, so converting a
 * quote reuses the exact invoice-draft creation path. The new invoice's issue date is today
 * (not the quote's) — the quote date has no fiscal meaning. */
export function invoiceDraftFromQuote(
  quote: QuoteTaxShape,
  lines: QuoteLineShape[],
  today: string = new Date().toISOString().slice(0, 10),
): DraftPatch {
  return {
    ivaRate: quote.ivaRate,
    irpfRate: quote.irpfRate,
    language: quote.language,
    issueDate: today,
    lines: lines.map(
      (l): NewInvoiceLine => ({
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
      }),
    ),
  };
}

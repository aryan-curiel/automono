import type { InvoiceLineRecord } from "../db/invoices";

interface NumberedInvoice {
  seriesPrefix: string | null;
  invoiceNumber: number | null;
  isRectification: boolean;
}

export function invoiceNumberLabel(inv: NumberedInvoice): string {
  if (inv.invoiceNumber == null || inv.seriesPrefix == null) return "Borrador";
  const n = String(inv.invoiceNumber).padStart(3, "0");
  return inv.seriesPrefix + "-" + (inv.isRectification ? "R" + n : n);
}

export function lineTotal(l: { quantity: number; unitPrice: number }): number {
  return roundCents(l.quantity * l.unitPrice);
}

/** Rounds a monetary amount to the nearest cent, avoiding binary floating-point noise
 * (e.g. 10.10 + 20.20 === 30.299999999999997) from reaching invoice totals or tax exports. */
export function roundCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export interface InvoiceAmounts {
  subtotal: number;
  ivaAmount: number;
  irpfAmount: number;
  total: number;
}

/** IVA/IRPF/total derivation shared by every place that turns a subtotal + rates into the rest
 * of an invoice's amounts (draft totals in `listInvoices`, and `amountsFromLines` below). */
export function amountsFromSubtotal(
  subtotal: number,
  ivaRate: number,
  irpfRate: number,
): InvoiceAmounts {
  const roundedSubtotal = roundCents(subtotal);
  const ivaAmount = roundCents((roundedSubtotal * ivaRate) / 100);
  const irpfAmount = roundCents((roundedSubtotal * irpfRate) / 100);
  return {
    subtotal: roundedSubtotal,
    ivaAmount,
    irpfAmount,
    total: roundCents(roundedSubtotal + ivaAmount - irpfAmount),
  };
}

export function amountsFromLines(
  lines: InvoiceLineRecord[],
  ivaRate: number,
  irpfRate: number,
): InvoiceAmounts {
  const subtotal = lines.reduce((s, l) => s + lineTotal(l), 0);
  return amountsFromSubtotal(subtotal, ivaRate, irpfRate);
}

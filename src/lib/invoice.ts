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
  return l.quantity * l.unitPrice;
}

export interface InvoiceAmounts {
  subtotal: number;
  ivaAmount: number;
  irpfAmount: number;
  total: number;
}

export function amountsFromLines(
  lines: InvoiceLineRecord[],
  ivaRate: number,
  irpfRate: number,
): InvoiceAmounts {
  const subtotal = lines.reduce((s, l) => s + lineTotal(l), 0);
  const ivaAmount = (subtotal * ivaRate) / 100;
  const irpfAmount = (subtotal * irpfRate) / 100;
  return { subtotal, ivaAmount, irpfAmount, total: subtotal + ivaAmount - irpfAmount };
}

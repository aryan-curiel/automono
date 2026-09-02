import { invoke } from "@tauri-apps/api/core";
import { getDb } from "./client";
import type { InvoiceLanguage } from "./clients";
import { createDraftInvoice, saveDraft, type InvoiceRecord } from "./invoices";
import { amountsFromSubtotal, lineTotal } from "../lib/invoice";
import { invoiceDraftFromQuote } from "../features/quotes/convert";
import { nextQuoteSeq } from "../features/quotes/numbering";

export type QuoteStatus = "draft" | "sent" | "accepted" | "rejected" | "expired" | "converted";

export const QUOTE_STATUSES: QuoteStatus[] = [
  "draft",
  "sent",
  "accepted",
  "rejected",
  "expired",
  "converted",
];

export interface QuoteItemRecord {
  id: number;
  quoteId: number;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface QuoteRecord {
  id: number;
  clientId: number;
  clientName: string;
  year: number;
  seq: number;
  issueDate: string;
  validUntil: string | null;
  status: QuoteStatus;
  notes: string;
  ivaRate: number;
  irpfRate: number | null;
  language: InvoiceLanguage;
  convertedInvoiceId: number | null;
  pdfPath: string | null;
}

export interface QuoteListItem extends QuoteRecord {
  subtotal: number;
  ivaAmount: number;
  irpfAmount: number;
  total: number;
}

interface QuoteRow {
  id: number;
  client_id: number;
  client_name: string;
  year: number;
  seq: number;
  issue_date: string;
  valid_until: string | null;
  status: QuoteStatus;
  notes: string;
  iva_rate: number;
  irpf_rate: number | null;
  language: InvoiceLanguage;
  converted_invoice_id: number | null;
  pdf_path: string | null;
}

interface QuoteItemRow {
  id: number;
  quote_id: number;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

const SELECT_QUOTE = `
  SELECT quotes.*, clients.name AS client_name
  FROM quotes
  JOIN clients ON clients.id = quotes.client_id
`;

function mapQuoteRow(row: QuoteRow): QuoteRecord {
  return {
    id: row.id,
    clientId: row.client_id,
    clientName: row.client_name,
    year: row.year,
    seq: row.seq,
    issueDate: row.issue_date,
    validUntil: row.valid_until,
    status: row.status,
    notes: row.notes,
    ivaRate: row.iva_rate,
    irpfRate: row.irpf_rate,
    language: row.language,
    convertedInvoiceId: row.converted_invoice_id,
    pdfPath: row.pdf_path,
  };
}

function mapItemRow(row: QuoteItemRow): QuoteItemRecord {
  return {
    id: row.id,
    quoteId: row.quote_id,
    description: row.description,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    total: row.total,
  };
}

async function getQuote(id: number): Promise<QuoteRecord | null> {
  const db = await getDb();
  const rows = await db.select<QuoteRow[]>(`${SELECT_QUOTE} WHERE quotes.id = $1`, [id]);
  return rows.length === 1 ? mapQuoteRow(rows[0]) : null;
}

export async function listQuotes(): Promise<QuoteListItem[]> {
  const db = await getDb();
  const rows = await db.select<(QuoteRow & { lines_subtotal: number })[]>(`
    SELECT quotes.*, clients.name AS client_name,
      COALESCE(SUM(quote_items.quantity * quote_items.unit_price), 0) AS lines_subtotal
    FROM quotes
    JOIN clients ON clients.id = quotes.client_id
    LEFT JOIN quote_items ON quote_items.quote_id = quotes.id
    GROUP BY quotes.id
    ORDER BY quotes.year DESC, quotes.seq DESC
  `);
  return rows.map((row) => {
    const quote = mapQuoteRow(row);
    const amounts = amountsFromSubtotal(row.lines_subtotal, quote.ivaRate, quote.irpfRate ?? 0);
    return { ...quote, ...amounts };
  });
}

export async function getQuoteWithLines(
  id: number,
): Promise<{ quote: QuoteRecord; lines: QuoteItemRecord[] } | null> {
  const quote = await getQuote(id);
  if (!quote) return null;
  const db = await getDb();
  const rows = await db.select<QuoteItemRow[]>(
    "SELECT * FROM quote_items WHERE quote_id = $1 ORDER BY id",
    [id],
  );
  return { quote, lines: rows.map(mapItemRow) };
}

export async function createQuote(clientId: number): Promise<QuoteRecord> {
  const db = await getDb();
  const year = new Date().getFullYear();
  const seqRows = await db.select<{ seq: number }[]>("SELECT seq FROM quotes WHERE year = $1", [
    year,
  ]);
  const seq = nextQuoteSeq(seqRows.map((r) => r.seq));
  const issueDate = new Date().toISOString().slice(0, 10);
  const result = await db.execute(
    "INSERT INTO quotes (client_id, year, seq, issue_date, status) VALUES ($1, $2, $3, $4, 'draft')",
    [clientId, year, seq, issueDate],
  );
  const quote = await getQuote(result.lastInsertId!);
  if (!quote) throw new Error("Failed to load quote after insert");
  return quote;
}

export interface QuotePatch {
  clientId: number;
  issueDate: string;
  validUntil: string | null;
  notes: string;
  ivaRate: number;
  irpfRate: number | null;
  language: InvoiceLanguage;
  lines: { description: string; quantity: number; unitPrice: number }[];
}

// A converted quote is frozen — its invoice is the source of truth from then on.
export async function saveQuote(id: number, patch: QuotePatch): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE quotes
     SET client_id = $1, issue_date = $2, valid_until = $3, notes = $4,
         iva_rate = $5, irpf_rate = $6, language = $7
     WHERE id = $8 AND status != 'converted'`,
    [
      patch.clientId,
      patch.issueDate,
      patch.validUntil,
      patch.notes,
      patch.ivaRate,
      patch.irpfRate,
      patch.language,
      id,
    ],
  );
  await db.execute("DELETE FROM quote_items WHERE quote_id = $1", [id]);
  for (const line of patch.lines) {
    await db.execute(
      `INSERT INTO quote_items (quote_id, description, quantity, unit_price, total)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, line.description, line.quantity, line.unitPrice, lineTotal(line)],
    );
  }
}

export async function setQuoteStatus(id: number, status: QuoteStatus): Promise<void> {
  const db = await getDb();
  // 'converted' is only ever set by convertQuoteToInvoice(), never from the status picker.
  await db.execute("UPDATE quotes SET status = $1 WHERE id = $2 AND status != 'converted'", [
    status,
    id,
  ]);
}

export async function deleteQuote(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM quotes WHERE id = $1 AND status != 'converted'", [id]);
}

/** Creates a draft invoice from the quote's client + lines + tax rates (reusing the normal
 * draft path), then stamps the quote as converted and links it. Returns the new draft. */
export async function convertQuoteToInvoice(id: number): Promise<InvoiceRecord> {
  const detail = await getQuoteWithLines(id);
  if (!detail) throw new Error("Quote not found");
  const { quote, lines } = detail;
  if (quote.status === "converted" && quote.convertedInvoiceId) {
    throw new Error("Quote already converted");
  }
  const draft = await createDraftInvoice(quote.clientId);
  await saveDraft(draft.id, invoiceDraftFromQuote(quote, lines));
  const db = await getDb();
  await db.execute(
    "UPDATE quotes SET status = 'converted', converted_invoice_id = $1 WHERE id = $2",
    [draft.id, id],
  );
  return draft;
}

export async function openOrGenerateQuotePdf(id: number, force = false): Promise<string> {
  return invoke<string>("get_or_generate_quote_pdf_cmd", { quoteId: id, force });
}

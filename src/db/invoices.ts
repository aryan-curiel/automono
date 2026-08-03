import { invoke } from "@tauri-apps/api/core";
import { getDb } from "./client";
import type { InvoiceLanguage, VatTreatment } from "./clients";
import type { RectificationType } from "../types";

export type InvoiceStatus = "draft" | "issued" | "paid";

export interface InvoiceLineRecord {
  id: number;
  invoiceId: number;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface NewInvoiceLine {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface InvoiceRecord {
  id: number;
  clientId: number;
  clientName: string;
  clientNif: string;
  clientVatNumber: string | null;
  clientAddress: string | null;
  seriesPrefix: string | null;
  invoiceNumber: number | null;
  issueDate: string | null;
  dueDate: string | null;
  status: InvoiceStatus;
  vatTreatment: VatTreatment | null;
  vatNoteText: string | null;
  language: InvoiceLanguage | null;
  subtotal: number | null;
  ivaRate: number | null;
  ivaAmount: number | null;
  irpfRate: number | null;
  irpfAmount: number | null;
  total: number | null;
  isRectification: boolean;
  rectifiesInvoiceId: number | null;
  rectifiedByInvoiceId: number | null;
  rectificationReason: string | null;
  rectificationType: RectificationType | null;
  pdfPath: string | null;
}

interface InvoiceRow {
  id: number;
  client_id: number;
  live_client_name: string;
  live_client_nif: string;
  live_client_vat_number: string | null;
  live_client_address: string | null;
  series_prefix: string | null;
  invoice_number: number | null;
  issue_date: string | null;
  due_date: string | null;
  status: InvoiceStatus;
  vat_treatment: VatTreatment | null;
  vat_note_text: string | null;
  language: InvoiceLanguage | null;
  client_name_snapshot: string | null;
  client_address_snapshot: string | null;
  client_nif_snapshot: string | null;
  client_vat_number_snapshot: string | null;
  subtotal: number | null;
  iva_rate: number | null;
  iva_amount: number | null;
  irpf_rate: number | null;
  irpf_amount: number | null;
  total: number | null;
  is_rectification: number;
  rectifies_invoice_id: number | null;
  rectified_by_invoice_id: number | null;
  rectification_reason: string | null;
  rectification_type: RectificationType | null;
  pdf_path: string | null;
}

// invoices.* only carries client_*_snapshot columns once issued (see 0004/0008
// migrations) — drafts have no snapshot yet, so fall back to the live client
// row. rectified_by_invoice_id has no column; it's the inverse of
// rectifies_invoice_id, resolved via a correlated subquery below.
const SELECT_INVOICE = `
  SELECT invoices.*,
    clients.name AS live_client_name,
    clients.nif_cif AS live_client_nif,
    clients.vat_number AS live_client_vat_number,
    clients.address AS live_client_address,
    (SELECT id FROM invoices r WHERE r.rectifies_invoice_id = invoices.id) AS rectified_by_invoice_id
  FROM invoices
  JOIN clients ON clients.id = invoices.client_id
`;

interface InvoiceLineRow {
  id: number;
  invoice_id: number;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

function mapInvoiceRow(row: InvoiceRow): InvoiceRecord {
  return {
    id: row.id,
    clientId: row.client_id,
    clientName: row.client_name_snapshot ?? row.live_client_name,
    clientNif: row.client_nif_snapshot ?? row.live_client_nif,
    clientVatNumber: row.client_vat_number_snapshot ?? row.live_client_vat_number,
    clientAddress: row.client_address_snapshot ?? row.live_client_address,
    seriesPrefix: row.series_prefix,
    invoiceNumber: row.invoice_number,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    status: row.status,
    vatTreatment: row.vat_treatment,
    vatNoteText: row.vat_note_text,
    language: row.language,
    subtotal: row.subtotal,
    ivaRate: row.iva_rate,
    ivaAmount: row.iva_amount,
    irpfRate: row.irpf_rate,
    irpfAmount: row.irpf_amount,
    total: row.total,
    isRectification: row.is_rectification === 1,
    rectifiesInvoiceId: row.rectifies_invoice_id,
    rectifiedByInvoiceId: row.rectified_by_invoice_id,
    rectificationReason: row.rectification_reason,
    rectificationType: row.rectification_type,
    pdfPath: row.pdf_path,
  };
}

function mapLineRow(row: InvoiceLineRow): InvoiceLineRecord {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    description: row.description,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    total: row.total,
  };
}

async function getInvoice(id: number): Promise<InvoiceRecord | null> {
  const db = await getDb();
  const rows = await db.select<InvoiceRow[]>(`${SELECT_INVOICE} WHERE invoices.id = $1`, [id]);
  return rows.length === 1 ? mapInvoiceRow(rows[0]) : null;
}

export async function createDraftInvoice(clientId: number): Promise<InvoiceRecord> {
  const db = await getDb();
  const result = await db.execute("INSERT INTO invoices (client_id, status) VALUES ($1, 'draft')", [
    clientId,
  ]);
  const invoice = await getInvoice(result.lastInsertId!);
  if (!invoice) throw new Error("Failed to load invoice after insert");
  return invoice;
}

export async function getInvoiceWithLines(
  id: number,
): Promise<{ invoice: InvoiceRecord; lines: InvoiceLineRecord[] } | null> {
  const invoice = await getInvoice(id);
  if (!invoice) return null;
  const db = await getDb();
  const rows = await db.select<InvoiceLineRow[]>(
    "SELECT * FROM invoice_lines WHERE invoice_id = $1 ORDER BY id",
    [id],
  );
  return { invoice, lines: rows.map(mapLineRow) };
}

export interface DraftPatch {
  ivaRate: number;
  irpfRate: number | null;
  language: InvoiceLanguage;
  lines: NewInvoiceLine[];
}

export async function saveDraft(id: number, patch: DraftPatch): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE invoices SET iva_rate = $1, irpf_rate = $2, language = $3 WHERE id = $4 AND status = 'draft'",
    [patch.ivaRate, patch.irpfRate, patch.language, id],
  );
  await db.execute("DELETE FROM invoice_lines WHERE invoice_id = $1", [id]);
  for (const line of patch.lines) {
    await db.execute(
      `INSERT INTO invoice_lines (invoice_id, description, quantity, unit_price, total)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, line.description, line.quantity, line.unitPrice, line.quantity * line.unitPrice],
    );
  }
}

interface IssuedInvoice {
  id: number;
  seriesPrefix: string;
  invoiceNumber: number;
  status: InvoiceStatus;
  issueDate: string;
  subtotal: number;
  ivaRate: number;
  ivaAmount: number;
  irpfRate: number | null;
  irpfAmount: number | null;
  total: number;
}

export async function issueInvoice(id: number): Promise<InvoiceRecord> {
  const issueDate = new Date().toISOString().slice(0, 10);
  await invoke<IssuedInvoice>("issue_invoice_cmd", { invoiceId: id, issueDate });
  const invoice = await getInvoice(id);
  if (!invoice) throw new Error("Failed to load invoice after issuing");
  return invoice;
}

export interface NewRectificationLine {
  description: string;
  quantity: number;
  unitPrice: number;
}

export async function createRectification(
  originalId: number,
  rectificationType: RectificationType,
  reason: string,
  lines: NewRectificationLine[],
): Promise<InvoiceRecord> {
  const issueDate = new Date().toISOString().slice(0, 10);
  const result = await invoke<IssuedInvoice>("create_rectification_cmd", {
    originalInvoiceId: originalId,
    rectificationType,
    reason,
    issueDate,
    lines,
  });
  const invoice = await getInvoice(result.id);
  if (!invoice) throw new Error("Failed to load rectification after creating it");
  return invoice;
}

// Copies client, tax rates, language, and lines into a fresh draft. Series/number/dates/status
// are never copied — those are only assigned when the new draft is issued.
export async function duplicateInvoice(id: number): Promise<InvoiceRecord> {
  const detail = await getInvoiceWithLines(id);
  if (!detail) throw new Error("Invoice not found");
  const { invoice, lines } = detail;
  const draft = await createDraftInvoice(invoice.clientId);
  await saveDraft(draft.id, {
    ivaRate: invoice.ivaRate ?? 0,
    irpfRate: invoice.irpfRate,
    language: invoice.language ?? "es",
    lines: lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
    })),
  });
  const created = await getInvoice(draft.id);
  if (!created) throw new Error("Failed to load duplicated invoice");
  return created;
}

export async function openOrGeneratePdf(id: number, force = false): Promise<string> {
  return invoke<string>("get_or_generate_invoice_pdf_cmd", { invoiceId: id, force });
}

export async function markInvoicePaid(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE invoices SET status = 'paid' WHERE id = $1 AND status = 'issued'", [id]);
}

export async function deleteInvoice(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM invoices WHERE id = $1 AND status = 'draft'", [id]);
}

// List-view row: unlike InvoiceRecord, amounts are never null here — for
// drafts (no stored subtotal/total yet) they're computed from invoice_lines
// so list/dashboard/summary screens can show a total without a second
// per-invoice line-item fetch.
export interface InvoiceListItem {
  id: number;
  clientId: number;
  clientName: string;
  seriesPrefix: string | null;
  invoiceNumber: number | null;
  issueDate: string | null;
  dueDate: string | null;
  status: InvoiceStatus;
  isRectification: boolean;
  rectifiesInvoiceId: number | null;
  rectifiedByInvoiceId: number | null;
  subtotal: number;
  ivaRate: number;
  ivaAmount: number;
  irpfRate: number;
  irpfAmount: number;
  total: number;
  pdfPath: string | null;
}

interface InvoiceListRow extends InvoiceRow {
  lines_subtotal: number;
}

export async function listInvoices(): Promise<InvoiceListItem[]> {
  const db = await getDb();
  const rows = await db.select<InvoiceListRow[]>(`
    SELECT invoices.*,
      clients.name AS live_client_name,
      clients.nif_cif AS live_client_nif,
      clients.address AS live_client_address,
      (SELECT id FROM invoices r WHERE r.rectifies_invoice_id = invoices.id) AS rectified_by_invoice_id,
      COALESCE(SUM(invoice_lines.quantity * invoice_lines.unit_price), 0) AS lines_subtotal
    FROM invoices
    JOIN clients ON clients.id = invoices.client_id
    LEFT JOIN invoice_lines ON invoice_lines.invoice_id = invoices.id
    GROUP BY invoices.id
    ORDER BY invoices.id DESC
  `);
  return rows.map((row) => {
    const ivaRate = row.iva_rate ?? 0;
    const irpfRate = row.irpf_rate ?? 0;
    const subtotal = row.subtotal ?? row.lines_subtotal;
    const ivaAmount = row.iva_amount ?? (subtotal * ivaRate) / 100;
    const irpfAmount = row.irpf_amount ?? (subtotal * irpfRate) / 100;
    const total = row.total ?? subtotal + ivaAmount - irpfAmount;
    return {
      id: row.id,
      clientId: row.client_id,
      clientName: row.client_name_snapshot ?? row.live_client_name,
      seriesPrefix: row.series_prefix,
      invoiceNumber: row.invoice_number,
      issueDate: row.issue_date,
      dueDate: row.due_date,
      status: row.status,
      isRectification: row.is_rectification === 1,
      rectifiesInvoiceId: row.rectifies_invoice_id,
      rectifiedByInvoiceId: row.rectified_by_invoice_id,
      subtotal,
      ivaRate,
      ivaAmount,
      irpfRate,
      irpfAmount,
      total,
      pdfPath: row.pdf_path,
    };
  });
}

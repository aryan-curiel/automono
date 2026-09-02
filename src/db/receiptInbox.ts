import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getDb } from "./client";
import { EXPENSE_FILE_EXTENSIONS } from "./expenses";

/** A receipt queued for review — copied into the archive and field-extracted, but not yet a
 * real expense. See migration 0042. */
export interface ReceiptInboxItem {
  id: number;
  receiptFilePath: string;
  sourceName: string;
  date: string | null;
  amount: number | null;
  ivaAmount: number | null;
  irpfRate: number | null;
  irpfAmount: number | null;
  vendor: string | null;
  createdAt: string;
}

interface ReceiptInboxRow {
  id: number;
  receipt_file_path: string;
  source_name: string;
  extracted_date: string | null;
  extracted_amount: number | null;
  extracted_iva_amount: number | null;
  extracted_irpf_rate: number | null;
  extracted_irpf_amount: number | null;
  extracted_vendor: string | null;
  created_at: string;
}

function mapRow(row: ReceiptInboxRow): ReceiptInboxItem {
  return {
    id: row.id,
    receiptFilePath: row.receipt_file_path,
    sourceName: row.source_name,
    date: row.extracted_date,
    amount: row.extracted_amount,
    ivaAmount: row.extracted_iva_amount,
    irpfRate: row.extracted_irpf_rate,
    irpfAmount: row.extracted_irpf_amount,
    vendor: row.extracted_vendor,
    createdAt: row.created_at,
  };
}

export async function listReceiptInbox(): Promise<ReceiptInboxItem[]> {
  const db = await getDb();
  const rows = await db.select<ReceiptInboxRow[]>(
    "SELECT * FROM receipt_inbox ORDER BY created_at DESC, id DESC",
  );
  return rows.map(mapRow);
}

export async function countReceiptInbox(): Promise<number> {
  const db = await getDb();
  const [{ count }] = await db.select<{ count: number }[]>(
    "SELECT COUNT(*) as count FROM receipt_inbox",
  );
  return count;
}

export async function deleteReceiptInboxItem(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM receipt_inbox WHERE id = $1", [id]);
}

interface IngestedReceipt {
  receipt_file_path: string;
  source_name: string;
  date: string | null;
  amount: number | null;
  iva_amount: number | null;
  irpf_rate: number | null;
  irpf_amount: number | null;
  vendor: string | null;
}

/** Copies `sourcePath` into the per-year receipts archive, extracts its fields, and inserts a
 * queue row. `deleteSource` removes the original — true for the watched-folder sweep, false for
 * a hand-picked file. Returns the new item. */
export async function ingestReceipt(
  sourcePath: string,
  deleteSource: boolean,
): Promise<ReceiptInboxItem> {
  const r = await invoke<IngestedReceipt>("ingest_receipt_cmd", {
    sourcePath,
    deleteSource,
    fallbackDate: new Date().toISOString().slice(0, 10),
  });
  const db = await getDb();
  const result = await db.execute(
    `INSERT INTO receipt_inbox
       (receipt_file_path, source_name, extracted_date, extracted_amount, extracted_iva_amount,
        extracted_irpf_rate, extracted_irpf_amount, extracted_vendor)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      r.receipt_file_path,
      r.source_name,
      r.date,
      r.amount,
      r.iva_amount,
      r.irpf_rate,
      r.irpf_amount,
      r.vendor,
    ],
  );
  const rows = await db.select<ReceiptInboxRow[]>("SELECT * FROM receipt_inbox WHERE id = $1", [
    result.lastInsertId!,
  ]);
  return mapRow(rows[0]);
}

/** Receipt files currently sitting in the watched folder (Rust-side scan). */
export function listInboxFolderFiles(folder: string): Promise<string[]> {
  return invoke<string[]>("list_receipt_inbox_files_cmd", { folder });
}

/** Native picker for the watched-folder path. */
export async function pickInboxFolder(): Promise<string | null> {
  const path = await open({ directory: true, multiple: false });
  return typeof path === "string" ? path : null;
}

/** Native picker for quick-add — one or more receipt files. */
export async function pickReceiptFiles(): Promise<string[]> {
  const picked = await open({
    multiple: true,
    filters: [{ name: "Recibo", extensions: EXPENSE_FILE_EXTENSIONS }],
  });
  if (Array.isArray(picked)) return picked;
  return typeof picked === "string" ? [picked] : [];
}

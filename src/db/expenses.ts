import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getDb } from "./client";

export interface ExpenseRecord {
  id: number;
  date: string;
  category: string | null;
  description: string | null;
  amount: number;
  ivaAmount: number | null;
  deductiblePct: number;
  receiptFilePath: string | null;
}

export type NewExpense = Omit<ExpenseRecord, "id">;

interface ExpenseRow {
  id: number;
  date: string;
  category: string | null;
  description: string | null;
  amount: number;
  iva_amount: number | null;
  deductible_pct: number;
  receipt_file_path: string | null;
}

function mapRow(row: ExpenseRow): ExpenseRecord {
  return {
    id: row.id,
    date: row.date,
    category: row.category,
    description: row.description,
    amount: row.amount,
    ivaAmount: row.iva_amount,
    deductiblePct: row.deductible_pct,
    receiptFilePath: row.receipt_file_path,
  };
}

export interface ExpenseFilter {
  from?: string;
  to?: string;
}

export async function listExpenses(filter: ExpenseFilter = {}): Promise<ExpenseRecord[]> {
  const db = await getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filter.from !== undefined) {
    params.push(filter.from);
    conditions.push(`date >= $${params.length}`);
  }
  if (filter.to !== undefined) {
    params.push(filter.to);
    conditions.push(`date <= $${params.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await db.select<ExpenseRow[]>(
    `SELECT * FROM expenses ${where} ORDER BY date DESC, id DESC`,
    params,
  );
  return rows.map(mapRow);
}

export async function getExpense(id: number): Promise<ExpenseRecord | null> {
  const db = await getDb();
  const rows = await db.select<ExpenseRow[]>("SELECT * FROM expenses WHERE id = $1", [id]);
  return rows.length === 1 ? mapRow(rows[0]) : null;
}

export async function createExpense(input: NewExpense): Promise<ExpenseRecord> {
  const db = await getDb();
  const result = await db.execute(
    `INSERT INTO expenses (date, category, description, amount, iva_amount, deductible_pct, receipt_file_path)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.date,
      input.category,
      input.description,
      input.amount,
      input.ivaAmount,
      input.deductiblePct,
      input.receiptFilePath,
    ],
  );
  const created = await getExpense(result.lastInsertId!);
  if (!created) throw new Error("Failed to load expense after insert");
  return created;
}

const COLUMN_BY_KEY: Record<keyof NewExpense, string> = {
  date: "date",
  category: "category",
  description: "description",
  amount: "amount",
  ivaAmount: "iva_amount",
  deductiblePct: "deductible_pct",
  receiptFilePath: "receipt_file_path",
};

export async function updateExpense(id: number, patch: Partial<NewExpense>): Promise<void> {
  const entries = Object.entries(patch) as [keyof NewExpense, unknown][];
  if (entries.length === 0) return;

  const db = await getDb();
  const setClause = entries.map(([key], i) => `${COLUMN_BY_KEY[key]} = $${i + 1}`).join(", ");
  const values = entries.map(([, value]) => value);
  await db.execute(`UPDATE expenses SET ${setClause} WHERE id = $${entries.length + 1}`, [
    ...values,
    id,
  ]);
}

export async function deleteExpense(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM expenses WHERE id = $1", [id]);
}

/** Opens the native file picker restricted to image/PDF receipts; returns the picked absolute path, or null if cancelled. */
export async function pickExpenseFile(): Promise<string | null> {
  const path = await open({
    multiple: false,
    filters: [{ name: "Recibo", extensions: ["pdf", "png", "jpg", "jpeg"] }],
  });
  return typeof path === "string" ? path : null;
}

/** Copies the file at `sourcePath` into the app data directory, named `<date>_<note>`. */
export async function attachExpenseFile(
  sourcePath: string,
  date: string,
  note: string,
): Promise<string> {
  return invoke<string>("attach_expense_file_cmd", { sourcePath, date, note });
}

export async function openExpenseFile(filePath: string): Promise<void> {
  return invoke("open_expense_file_cmd", { filePath });
}

export interface ReceiptFields {
  date: string | null;
  amount: number | null;
  ivaAmount: number | null;
  vendorGuess: string | null;
}

interface ReceiptFieldsRow {
  date: string | null;
  amount: number | null;
  iva_amount: number | null;
  vendor_guess: string | null;
}

/** Best-effort field extraction from a PDF receipt's text layer; every field may be null. */
export async function extractReceiptFields(filePath: string): Promise<ReceiptFields> {
  const row = await invoke<ReceiptFieldsRow>("extract_receipt_fields_cmd", { filePath });
  return {
    date: row.date,
    amount: row.amount,
    ivaAmount: row.iva_amount,
    vendorGuess: row.vendor_guess,
  };
}

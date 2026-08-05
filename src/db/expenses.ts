import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getDb } from "./client";
import type { LlmProvider } from "./llmSettings";

export interface ExpenseRecord {
  id: number;
  date: string;
  category: string | null;
  description: string | null;
  amount: number;
  ivaAmount: number | null;
  deductiblePct: number;
  irpfRate: number | null;
  irpfAmount: number | null;
  receiptFilePath: string | null;
  /** Quarter ("YYYY-QN") to declare this expense in, if different from the quarter of `date`. */
  declaredPeriod: string | null;
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
  irpf_rate: number | null;
  irpf_amount: number | null;
  receipt_file_path: string | null;
  declared_period: string | null;
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
    irpfRate: row.irpf_rate,
    irpfAmount: row.irpf_amount,
    receiptFilePath: row.receipt_file_path,
    declaredPeriod: row.declared_period,
  };
}

export interface ExpenseFilter {
  from?: string;
  to?: string;
  /**
   * Quarter keys ("YYYY-QN") the viewed period overlaps (see `quartersInRange`). When set, an
   * expense matches if its `date` falls in [from, to] AND it has no override, OR its
   * `declared_period` is one of these quarters — so a June expense declared into Q3 shows up
   * under the Q3 filing even though its date sits in Q2.
   */
  quarterKeys?: string[];
}

export async function listExpenses(filter: ExpenseFilter = {}): Promise<ExpenseRecord[]> {
  const db = await getDb();
  const params: unknown[] = [];
  const dateConditions: string[] = [];
  if (filter.from !== undefined) {
    params.push(filter.from);
    dateConditions.push(`date >= $${params.length}`);
  }
  if (filter.to !== undefined) {
    params.push(filter.to);
    dateConditions.push(`date <= $${params.length}`);
  }

  let where: string;
  if (filter.quarterKeys && filter.quarterKeys.length > 0) {
    const naturalMatch = ["declared_period IS NULL", ...dateConditions].join(" AND ");
    const quarterPlaceholders = filter.quarterKeys.map((_, i) => `$${params.length + i + 1}`);
    params.push(...filter.quarterKeys);
    where = `WHERE (${naturalMatch}) OR declared_period IN (${quarterPlaceholders.join(", ")})`;
  } else {
    where = dateConditions.length > 0 ? `WHERE ${dateConditions.join(" AND ")}` : "";
  }

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
    `INSERT INTO expenses (date, category, description, amount, iva_amount, deductible_pct, irpf_rate, irpf_amount, receipt_file_path, declared_period)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      input.date,
      input.category,
      input.description,
      input.amount,
      input.ivaAmount,
      input.deductiblePct,
      input.irpfRate,
      input.irpfAmount,
      input.receiptFilePath,
      input.declaredPeriod,
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
  irpfRate: "irpf_rate",
  irpfAmount: "irpf_amount",
  receiptFilePath: "receipt_file_path",
  declaredPeriod: "declared_period",
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

/** Best-effort removal of the given files from disk; a missing/already-deleted file is not an error. */
export async function deleteExpenseFiles(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  await invoke("delete_expense_files_cmd", { paths });
}

export const EXPENSE_FILE_EXTENSIONS = ["pdf", "png", "jpg", "jpeg"];

/** True if `path`'s extension matches the receipt types accepted by pickExpenseFile/drag-drop. */
export function isSupportedExpenseFile(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase();
  return !!ext && EXPENSE_FILE_EXTENSIONS.includes(ext);
}

/** Opens the native file picker restricted to image/PDF receipts; returns the picked absolute path, or null if cancelled. */
export async function pickExpenseFile(): Promise<string | null> {
  const path = await open({
    multiple: false,
    filters: [{ name: "Recibo", extensions: EXPENSE_FILE_EXTENSIONS }],
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
  irpfRate: number | null;
  irpfAmount: number | null;
  vendorGuess: string | null;
}

interface ReceiptFieldsRow {
  date: string | null;
  amount: number | null;
  iva_amount: number | null;
  irpf_rate: number | null;
  irpf_amount: number | null;
  vendor_guess: string | null;
}

/** Best-effort field extraction from a PDF receipt's text layer; every field may be null. */
export async function extractReceiptFields(filePath: string): Promise<ReceiptFields> {
  const row = await invoke<ReceiptFieldsRow>("extract_receipt_fields_cmd", { filePath });
  return {
    date: row.date,
    amount: row.amount,
    ivaAmount: row.iva_amount,
    irpfRate: row.irpf_rate,
    irpfAmount: row.irpf_amount,
    vendorGuess: row.vendor_guess,
  };
}

export interface ReceiptFieldsLlm extends ReceiptFields {
  category: string | null;
}

interface ReceiptFieldsLlmRow extends ReceiptFieldsRow {
  category: string | null;
}

/**
 * LLM-based field extraction — works for PDF and image receipts alike across any configured
 * provider (Anthropic, OpenAI, OpenRouter), and additionally matches the receipt against
 * `categories` (the user's real category list). Throws if the API key is invalid, `model` is
 * required but missing (OpenRouter), or the request fails; callers should fall back to
 * `extractReceiptFields` for PDFs.
 */
export async function extractReceiptFieldsLlm(
  filePath: string,
  provider: LlmProvider,
  apiKey: string,
  model: string | null,
  categories: string[],
): Promise<ReceiptFieldsLlm> {
  const row = await invoke<ReceiptFieldsLlmRow>("extract_receipt_fields_llm_cmd", {
    filePath,
    provider,
    apiKey,
    model,
    categories,
  });
  return {
    date: row.date,
    amount: row.amount,
    ivaAmount: row.iva_amount,
    irpfRate: row.irpf_rate,
    irpfAmount: row.irpf_amount,
    vendorGuess: row.vendor_guess,
    category: row.category,
  };
}

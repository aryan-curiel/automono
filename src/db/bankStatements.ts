import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getDb } from "./client";
import { recordPayment } from "./invoices";
import { dedupeKey, type StatementLine } from "../lib/bankReconcile";

export interface BankStatementLineRecord {
  id: number;
  valueDate: string;
  amount: number;
  description: string;
  reference: string;
  matchedInvoiceId: number | null;
  reconciledAt: string | null;
}

interface BankStatementLineRow {
  id: number;
  value_date: string;
  amount: number;
  description: string;
  reference: string;
  matched_invoice_id: number | null;
  reconciled_at: string | null;
}

function mapRow(row: BankStatementLineRow): BankStatementLineRecord {
  return {
    id: row.id,
    valueDate: row.value_date,
    amount: row.amount,
    description: row.description,
    reference: row.reference,
    matchedInvoiceId: row.matched_invoice_id,
    reconciledAt: row.reconciled_at,
  };
}

/** Opens a file picker for a bank-statement CSV and returns its text, or null if cancelled. */
export async function pickStatementCsv(): Promise<string | null> {
  const path = await open({
    multiple: false,
    filters: [{ name: "CSV", extensions: ["csv", "txt"] }],
  });
  if (typeof path !== "string") return null;
  return invoke<string>("read_text_file_cmd", { path });
}

/**
 * Inserts parsed statement lines, skipping any whose dedupe key is already stored — so
 * re-importing an overlapping export is idempotent. Returns how many were new vs skipped.
 */
export async function importStatementLines(
  lines: StatementLine[],
): Promise<{ inserted: number; skipped: number }> {
  const db = await getDb();
  let inserted = 0;
  for (const line of lines) {
    const res = await db.execute(
      `INSERT OR IGNORE INTO bank_statement_lines
         (dedupe_key, value_date, amount, description, reference)
       VALUES ($1, $2, $3, $4, $5)`,
      [dedupeKey(line), line.valueDate, line.amount, line.description, line.reference],
    );
    if (res.rowsAffected > 0) inserted++;
  }
  return { inserted, skipped: lines.length - inserted };
}

export async function listUnreconciledLines(): Promise<BankStatementLineRecord[]> {
  const db = await getDb();
  const rows = await db.select<BankStatementLineRow[]>(
    `SELECT * FROM bank_statement_lines
     WHERE matched_invoice_id IS NULL
     ORDER BY value_date DESC, id DESC`,
  );
  return rows.map(mapRow);
}

export async function listReconciledLines(): Promise<BankStatementLineRecord[]> {
  const db = await getDb();
  const rows = await db.select<BankStatementLineRow[]>(
    `SELECT * FROM bank_statement_lines
     WHERE matched_invoice_id IS NOT NULL
     ORDER BY reconciled_at DESC, id DESC`,
  );
  return rows.map(mapRow);
}

/**
 * Confirms a proposed match: records the payment against the invoice with the line's real
 * value date (feeding the cash-basis toggle and the collections/aging view), then links the
 * line so it drops out of the unreconciled list and a re-import can't double-count it.
 */
export async function confirmMatch(
  lineId: number,
  invoiceId: number,
  amount: number,
  valueDate: string,
): Promise<void> {
  await recordPayment(invoiceId, amount, valueDate);
  const db = await getDb();
  await db.execute(
    `UPDATE bank_statement_lines
     SET matched_invoice_id = $2, reconciled_at = datetime('now')
     WHERE id = $1`,
    [lineId, invoiceId],
  );
}

/**
 * Unlinks a line from its invoice (e.g. matched by mistake). Does NOT reverse the payment
 * already recorded on the invoice — the caller warns the user to adjust it in Cobros.
 *
 * ponytail: no payment reversal here — recordPayment has no inverse and partial-payment
 * history isn't tracked. Manual fix in Cobros is the escape hatch.
 */
export async function unmatchLine(lineId: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE bank_statement_lines SET matched_invoice_id = NULL, reconciled_at = NULL WHERE id = $1`,
    [lineId],
  );
}

import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getDb } from "./client";
import {
  buildDeclarationCsv,
  buildDeclarationSnapshot,
  expensesInPeriod,
  paidInvoicesInPeriod,
  type DeclarationSnapshot,
} from "../lib/quarterlyDeclaration";
import type { ModeloFields } from "../lib/modeloReport";
import { listInvoices, type InvoiceListItem } from "./invoices";
import { listExpenses, type ExpenseRecord } from "./expenses";
import { quarterRange } from "../lib/dateRange";

export type DeclarationStatus = "in_progress" | "completed";
export type Modelo = "303" | "130" | "111";

export interface DeclarationListItem {
  id: number;
  year: number;
  quarter: number;
  status: DeclarationStatus;
  invoiceCount: number;
  expenseCount: number;
  invoicedTotal: number;
  expensesTotal: number;
}

export interface DeclarationDetail {
  id: number;
  year: number;
  quarter: number;
  status: DeclarationStatus;
  snapshot: DeclarationSnapshot;
  modelo303Path: string | null;
  modelo130Path: string | null;
  modelo111Path: string | null;
}

interface DeclarationRow {
  id: number;
  year: number;
  quarter: number;
  status: DeclarationStatus;
  snapshot_json: string;
  modelo_303_path: string | null;
  modelo_130_path: string | null;
  modelo_111_path: string | null;
}

function mapRow(row: DeclarationRow): DeclarationDetail {
  return {
    id: row.id,
    year: row.year,
    quarter: row.quarter,
    status: row.status,
    snapshot: JSON.parse(row.snapshot_json) as DeclarationSnapshot,
    modelo303Path: row.modelo_303_path,
    modelo130Path: row.modelo_130_path,
    modelo111Path: row.modelo_111_path,
  };
}

const MODELO_COLUMN: Record<Modelo, string> = {
  "303": "modelo_303_path",
  "130": "modelo_130_path",
  "111": "modelo_111_path",
};

/** A `completed` declaration's snapshot is the frozen record of what was actually filed and is
 * returned as-is. An `in_progress` one is still being reconciled, so its snapshot is recomputed
 * from the current invoices/expenses every time — otherwise edits made after the declaration was
 * created (e.g. fixing an expense amount, adding a missed receipt) would silently never show up
 * in the Modelo Review comparison or the detail screen's/list's KPIs.
 *
 * `allInvoices`/`allExpenses` are the full lists, fetched once by the caller — a per-row query
 * here would turn `listDeclarations` into an N+1 (N full-table invoice/expense fetches for N
 * in-progress declarations). */
function currentSnapshot(
  row: DeclarationRow,
  allInvoices: InvoiceListItem[],
  allExpenses: ExpenseRecord[],
): DeclarationSnapshot {
  if (row.status === "completed") return JSON.parse(row.snapshot_json) as DeclarationSnapshot;

  const period = quarterRange(row.year, row.quarter as 1 | 2 | 3 | 4);
  return buildDeclarationSnapshot(
    paidInvoicesInPeriod(allInvoices, period),
    expensesInPeriod(allExpenses, period),
  );
}

export async function listDeclarations(): Promise<DeclarationListItem[]> {
  const db = await getDb();
  const [rows, invoices, expenses] = await Promise.all([
    db.select<DeclarationRow[]>("SELECT * FROM quarterly_declarations ORDER BY year DESC, quarter DESC"),
    listInvoices(),
    listExpenses(),
  ]);
  return rows.map((row) => {
    const snapshot = currentSnapshot(row, invoices, expenses);
    return {
      id: row.id,
      year: row.year,
      quarter: row.quarter,
      status: row.status,
      invoiceCount: snapshot.invoices.length,
      expenseCount: snapshot.expenses.length,
      invoicedTotal: snapshot.totals.invoicedBase,
      expensesTotal: snapshot.totals.expensesDeductibleBase,
    };
  });
}

export async function getDeclaration(id: number): Promise<DeclarationDetail | null> {
  const db = await getDb();
  const rows = await db.select<DeclarationRow[]>(
    "SELECT * FROM quarterly_declarations WHERE id = $1",
    [id],
  );
  if (rows.length !== 1) return null;
  const row = rows[0];
  const [invoices, expenses] = await Promise.all([listInvoices(), listExpenses()]);
  const snapshot = currentSnapshot(row, invoices, expenses);
  return { ...mapRow(row), snapshot };
}

export async function createDeclaration(
  year: number,
  quarter: number,
  snapshot: DeclarationSnapshot,
): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    "INSERT INTO quarterly_declarations (year, quarter, snapshot_json) VALUES ($1, $2, $3)",
    [year, quarter, JSON.stringify(snapshot)],
  );
  return result.lastInsertId!;
}

/** Deletes an in-progress declaration outright — a `completed` one is a filed record and can't
 * be removed this way, guarded here (not just in the UI) since its snapshot is the frozen source
 * of truth for what was actually declared. */
export async function deleteDeclaration(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM quarterly_declarations WHERE id = $1 AND status = 'in_progress'", [
    id,
  ]);
}

/** Copies the filed Modelo PDF into app storage and records its path on the declaration. */
export async function attachDeclarationFile(
  id: number,
  year: number,
  quarter: number,
  modelo: Modelo,
  sourcePath: string,
): Promise<string> {
  const storedPath = await invoke<string>("attach_declaration_file_cmd", {
    year,
    quarter,
    modelo,
    sourcePath,
  });
  const db = await getDb();
  await db.execute(
    `UPDATE quarterly_declarations SET ${MODELO_COLUMN[modelo]} = $1 WHERE id = $2`,
    [storedPath, id],
  );
  return storedPath;
}

/** Marks a declaration completed. Throws if any of the three Modelo PDFs hasn't been attached yet.
 * Also flags every expense in the frozen snapshot as declared, so Gastos reflects what was
 * actually filed regardless of any `declared_period` override used to build that snapshot. */
export async function markDeclarationCompleted(id: number): Promise<void> {
  const declaration = await getDeclaration(id);
  if (!declaration) throw new Error("Declaration not found");
  if (!declaration.modelo303Path || !declaration.modelo130Path || !declaration.modelo111Path) {
    throw new Error("All three Modelo PDFs (303, 130, 111) must be attached before completing");
  }
  const db = await getDb();
  await db.execute(
    "UPDATE quarterly_declarations SET status = 'completed', completed_at = datetime('now'), snapshot_json = $2 WHERE id = $1",
    [id, JSON.stringify(declaration.snapshot)],
  );
  const expenseIds = declaration.snapshot.expenses.map((e) => e.id);
  if (expenseIds.length > 0) {
    const placeholders = expenseIds.map((_, i) => `$${i + 1}`).join(", ");
    await db.execute(`UPDATE expenses SET declared = 1 WHERE id IN (${placeholders})`, expenseIds);
  }
}

/** Opens the native file picker restricted to PDFs; returns the picked absolute path, or null if cancelled. */
export async function pickDeclarationFile(): Promise<string | null> {
  const path = await open({ multiple: false, filters: [{ name: "PDF", extensions: ["pdf"] }] });
  return typeof path === "string" ? path : null;
}

export async function openDeclarationFile(filePath: string): Promise<void> {
  return invoke("open_declaration_file_cmd", { filePath });
}

export interface ModeloDetection {
  modelo: Modelo;
  year: number | null;
  quarter: number | null;
}

interface ModeloDetectionRaw {
  modelo: string;
  year: number | null;
  quarter: number | null;
}

/** Detects which modelo (303/130/111) a PDF is and reads its declared year/quarter off its own
 * header text. Throws if the PDF isn't recognized as any of the three — the hard-stop error the
 * review flow surfaces before any comparison happens. */
export async function detectModelo(filePath: string): Promise<ModeloDetection> {
  const raw = await invoke<ModeloDetectionRaw>("detect_modelo_cmd", { filePath });
  return { modelo: raw.modelo as Modelo, year: raw.year, quarter: raw.quarter };
}

interface ModeloFieldsRaw {
  iva_devengado: number | null;
  iva_deducible: number | null;
  resultado_liquidacion: number | null;
  rendimiento_neto: number | null;
  pago_fraccionado: number | null;
  base_retenciones: number | null;
  retenciones_ingresadas: number | null;
}

/** Extracts the modelo's own headline figures for comparison — via the configured LLM provider
 * if given, falling back to a regex/keyword scan of the PDF's text layer otherwise (mirrors the
 * LLM-then-regex fallback already used for expense receipts). */
export async function extractModeloFields(
  filePath: string,
  modelo: Modelo,
  provider: string | null,
  apiKey: string | null,
  model: string | null,
): Promise<ModeloFields> {
  const raw = await invoke<ModeloFieldsRaw>("extract_modelo_fields_cmd", {
    filePath,
    modelo,
    provider,
    apiKey,
    model,
  });
  return {
    ivaDevengado: raw.iva_devengado,
    ivaDeducible: raw.iva_deducible,
    resultadoLiquidacion: raw.resultado_liquidacion,
    rendimientoNeto: raw.rendimiento_neto,
    pagoFraccionado: raw.pago_fraccionado,
    baseRetenciones: raw.base_retenciones,
    retencionesIngresadas: raw.retenciones_ingresadas,
  };
}

/** Builds the "download as zip" bundle for a declaration, sourced from its locked snapshot. */
export async function exportDeclarationZip(id: number, destPath: string): Promise<string> {
  const declaration = await getDeclaration(id);
  if (!declaration) throw new Error("Declaration not found");
  const invoicePdfPaths = declaration.snapshot.invoices
    .map((inv) => inv.pdfPath)
    .filter((p): p is string => !!p);
  const expenseReceiptPaths = declaration.snapshot.expenses
    .map((e) => e.receiptFilePath)
    .filter((p): p is string => !!p);
  return invoke<string>("export_declaration_zip_cmd", {
    destPath,
    invoicePdfPaths,
    expenseReceiptPaths,
    csvContents: buildDeclarationCsv(declaration.snapshot),
  });
}

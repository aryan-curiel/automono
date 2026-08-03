import { invoke } from "@tauri-apps/api/core";

/** Writes `contents` to `path` on disk, overwriting any existing file. */
export function writeTextFile(path: string, contents: string): Promise<void> {
  return invoke("write_text_file_cmd", { path, contents });
}

/**
 * Builds a "hand this to your gestor" folder at `destFolder`: invoice PDFs under `facturas/`,
 * expense receipts under `gastos/`, and `csvContents` as `resumen.csv`. Returns `destFolder`.
 */
export function exportGestorBundle(
  destFolder: string,
  invoicePdfPaths: string[],
  expenseReceiptPaths: string[],
  csvContents: string,
): Promise<string> {
  return invoke("export_gestor_bundle_cmd", {
    destFolder,
    invoicePdfPaths,
    expenseReceiptPaths,
    csvContents,
  });
}

import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getDb } from "./client";
import type { LlmProvider } from "./llmSettings";
import type { BusinessProfileRecord } from "./businessProfile";

export const BUSINESS_DOCUMENT_EXTENSIONS = ["pdf", "png", "jpg", "jpeg"];

/** True if `path`'s extension matches the types accepted by the drop zone/picker. */
export function isSupportedBusinessDocumentFile(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase();
  return !!ext && BUSINESS_DOCUMENT_EXTENSIONS.includes(ext);
}

export interface BusinessDocumentRecord {
  id: number;
  filePath: string;
  originalName: string;
  /** Short label identifying what kind of document this is, assigned by the LLM at upload time. */
  label: string | null;
  uploadedAt: string;
  summary: string | null;
  extractedJson: string | null;
}

interface BusinessDocumentRow {
  id: number;
  file_path: string;
  original_name: string;
  label: string | null;
  uploaded_at: string;
  summary: string | null;
  extracted_json: string | null;
}

function mapRow(row: BusinessDocumentRow): BusinessDocumentRecord {
  return {
    id: row.id,
    filePath: row.file_path,
    originalName: row.original_name,
    label: row.label,
    uploadedAt: row.uploaded_at,
    summary: row.summary,
    extractedJson: row.extracted_json,
  };
}

export async function listBusinessDocuments(): Promise<BusinessDocumentRecord[]> {
  const db = await getDb();
  const rows = await db.select<BusinessDocumentRow[]>(
    "SELECT id, file_path, original_name, label, uploaded_at, summary, extracted_json FROM business_documents ORDER BY id",
  );
  return rows.map(mapRow);
}

export async function insertBusinessDocument(
  record: Omit<BusinessDocumentRecord, "id">,
): Promise<BusinessDocumentRecord> {
  const db = await getDb();
  const result = await db.execute(
    `INSERT INTO business_documents (file_path, original_name, label, uploaded_at, summary, extracted_json)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      record.filePath,
      record.originalName,
      record.label,
      record.uploadedAt,
      record.summary,
      record.extractedJson,
    ],
  );
  return { ...record, id: result.lastInsertId! };
}

/** Removes the document's DB row only — the file itself is left in the app data directory. */
export async function deleteBusinessDocument(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM business_documents WHERE id = $1", [id]);
}

/** Opens the native file picker for one or more documents (PDF or image). */
export async function pickBusinessDocuments(): Promise<string[]> {
  const paths = await open({
    multiple: true,
    filters: [{ name: "Documento", extensions: BUSINESS_DOCUMENT_EXTENSIONS }],
  });
  if (!paths) return [];
  return Array.isArray(paths) ? paths : [paths];
}

/** Copies the file at `sourcePath` into the app data directory, keeping its own name. */
export async function attachBusinessDocument(sourcePath: string): Promise<string> {
  return invoke<string>("attach_business_document_cmd", { sourcePath });
}

/** Opens the stored document in the OS default app for its file type. */
export async function openBusinessDocumentFile(filePath: string): Promise<void> {
  return invoke("open_business_document_file_cmd", { filePath });
}

export interface RegistrationFields {
  label: string | null;
  businessName: string | null;
  nif: string | null;
  address: string | null;
  bankName: string | null;
  iban: string | null;
  retaStartDate: string | null;
  summary: string | null;
}

interface RegistrationFieldsRow {
  label: string | null;
  business_name: string | null;
  nif: string | null;
  address: string | null;
  bank_name: string | null;
  iban: string | null;
  reta_start_date: string | null;
  summary: string | null;
}

/**
 * LLM-based identification + field extraction from an arbitrary business document (PDF or
 * image). Throws if the API key is invalid, `model` is required but missing (OpenRouter), or
 * the request fails — callers should treat a failed extraction as "nothing to prefill," not a
 * blocking error on the upload itself.
 */
export async function extractBusinessDocumentFields(
  filePath: string,
  provider: LlmProvider,
  apiKey: string,
  model: string | null,
): Promise<RegistrationFields> {
  const row = await invoke<RegistrationFieldsRow>("extract_business_document_fields_cmd", {
    filePath,
    provider,
    apiKey,
    model,
  });
  return {
    label: row.label,
    businessName: row.business_name,
    nif: row.nif,
    address: row.address,
    bankName: row.bank_name,
    iban: row.iban,
    retaStartDate: row.reta_start_date,
    summary: row.summary,
  };
}

/** Synthesizes several documents' summaries into one cohesive markdown "memory" document. */
export async function synthesizeUserContext(
  summaries: string[],
  provider: LlmProvider,
  apiKey: string,
  model: string | null,
): Promise<string> {
  return invoke<string>("synthesize_user_context_cmd", { summaries, provider, apiKey, model });
}

/**
 * Fills only the business-profile fields that are still blank in `current` — a field the user
 * already has a value for is never replaced, even if a later document extracts something
 * different (a mis-read, or a second document upload after onboarding is already complete).
 */
export function mergeRegistrationFields(
  current: BusinessProfileRecord,
  fields: RegistrationFields,
): BusinessProfileRecord {
  const keep = (value: string, extracted: string | null) => (value.trim() ? value : extracted ?? value);
  return {
    ...current,
    name: keep(current.name, fields.businessName),
    nifCif: keep(current.nifCif, fields.nif),
    address: keep(current.address, fields.address),
    bankName: keep(current.bankName, fields.bankName),
    iban: keep(current.iban, fields.iban),
  };
}

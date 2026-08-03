import type Database from "@tauri-apps/plugin-sql";
import { getDb } from "./client";

export type VatTreatment = "standard" | "reverse_charge_eu" | "export_outside_eu" | "exempt_other";
export type InvoiceLanguage = "es" | "en" | "ca";

export interface ClientRecord {
  id: number;
  name: string;
  nifCif: string;
  vatNumber: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  seriesId: number;
  seriesPrefix: string;
  nextInvoiceNumber: number;
  nextRectificationNumber: number;
  vatTreatment: VatTreatment;
  invoiceLanguage: InvoiceLanguage;
  country: string | null;
}

// Either reuse an existing series (e.g. a shared "occasional clients" series)
// or create a new one with this prefix.
export type SeriesSelection = { id: number } | { newPrefix: string };

export interface NewClient {
  name: string;
  nifCif: string;
  vatNumber: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  series: SeriesSelection;
  vatTreatment: VatTreatment;
  invoiceLanguage: InvoiceLanguage;
  country: string | null;
}

interface ClientRow {
  id: number;
  name: string;
  nif_cif: string;
  vat_number: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  series_id: number;
  series_prefix: string;
  next_invoice_number: number;
  next_rectification_number: number;
  vat_treatment: VatTreatment;
  invoice_language: InvoiceLanguage;
  country: string | null;
}

const SELECT_CLIENT = `
  SELECT clients.*,
    invoice_series.prefix AS series_prefix,
    invoice_series.next_invoice_number,
    invoice_series.next_rectification_number
  FROM clients
  JOIN invoice_series ON invoice_series.id = clients.series_id
`;

function mapRow(row: ClientRow): ClientRecord {
  return {
    id: row.id,
    name: row.name,
    nifCif: row.nif_cif,
    vatNumber: row.vat_number,
    address: row.address,
    email: row.email,
    phone: row.phone,
    notes: row.notes,
    seriesId: row.series_id,
    seriesPrefix: row.series_prefix,
    nextInvoiceNumber: row.next_invoice_number,
    nextRectificationNumber: row.next_rectification_number,
    vatTreatment: row.vat_treatment,
    invoiceLanguage: row.invoice_language,
    country: row.country,
  };
}

async function resolveSeriesId(db: Database, series: SeriesSelection): Promise<number> {
  if ("id" in series) return series.id;
  const result = await db.execute("INSERT INTO invoice_series (prefix) VALUES ($1)", [
    series.newPrefix,
  ]);
  return result.lastInsertId!;
}

export async function listClients(): Promise<ClientRecord[]> {
  const db = await getDb();
  const rows = await db.select<ClientRow[]>(`${SELECT_CLIENT} ORDER BY clients.name`);
  return rows.map(mapRow);
}

export async function getClient(id: number): Promise<ClientRecord | null> {
  const db = await getDb();
  const rows = await db.select<ClientRow[]>(`${SELECT_CLIENT} WHERE clients.id = $1`, [id]);
  return rows.length === 1 ? mapRow(rows[0]) : null;
}

export async function createClient(input: NewClient): Promise<ClientRecord> {
  const db = await getDb();
  const seriesId = await resolveSeriesId(db, input.series);
  const result = await db.execute(
    `INSERT INTO clients (name, nif_cif, vat_number, address, email, phone, notes, series_id, vat_treatment, invoice_language, country)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      input.name,
      input.nifCif,
      input.vatNumber,
      input.address,
      input.email,
      input.phone,
      input.notes,
      seriesId,
      input.vatTreatment,
      input.invoiceLanguage,
      input.country,
    ],
  );
  const created = await getClient(result.lastInsertId!);
  if (!created) throw new Error("Failed to load client after insert");
  return created;
}

const COLUMN_BY_KEY: Record<Exclude<keyof NewClient, "series">, string> = {
  name: "name",
  nifCif: "nif_cif",
  vatNumber: "vat_number",
  address: "address",
  email: "email",
  phone: "phone",
  notes: "notes",
  vatTreatment: "vat_treatment",
  invoiceLanguage: "invoice_language",
  country: "country",
};

export async function updateClient(id: number, patch: Partial<NewClient>): Promise<void> {
  const { series, ...rest } = patch;
  const entries = Object.entries(rest) as [Exclude<keyof NewClient, "series">, unknown][];
  const setPairs: [string, unknown][] = entries.map(([key, value]) => [COLUMN_BY_KEY[key], value]);

  const db = await getDb();
  if (series) {
    setPairs.push(["series_id", await resolveSeriesId(db, series)]);
  }
  if (setPairs.length === 0) return;

  const setClause = setPairs.map(([col], i) => `${col} = $${i + 1}`).join(", ");
  const values = setPairs.map(([, value]) => value);
  await db.execute(`UPDATE clients SET ${setClause} WHERE id = $${setPairs.length + 1}`, [
    ...values,
    id,
  ]);
}

export async function deleteClient(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM clients WHERE id = $1", [id]);
}

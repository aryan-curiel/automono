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
  invoicePrefix: string;
  nextInvoiceNumber: number;
  nextRectificationNumber: number;
  vatTreatment: VatTreatment;
  invoiceLanguage: InvoiceLanguage;
  country: string | null;
}

export type NewClient = Pick<
  ClientRecord,
  | "name"
  | "nifCif"
  | "vatNumber"
  | "address"
  | "email"
  | "phone"
  | "notes"
  | "invoicePrefix"
  | "vatTreatment"
  | "invoiceLanguage"
  | "country"
>;

interface ClientRow {
  id: number;
  name: string;
  nif_cif: string;
  vat_number: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  invoice_prefix: string;
  next_invoice_number: number;
  next_rectification_number: number;
  vat_treatment: VatTreatment;
  invoice_language: InvoiceLanguage;
  country: string | null;
}

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
    invoicePrefix: row.invoice_prefix,
    nextInvoiceNumber: row.next_invoice_number,
    nextRectificationNumber: row.next_rectification_number,
    vatTreatment: row.vat_treatment,
    invoiceLanguage: row.invoice_language,
    country: row.country,
  };
}

export async function listClients(): Promise<ClientRecord[]> {
  const db = await getDb();
  const rows = await db.select<ClientRow[]>("SELECT * FROM clients ORDER BY name");
  return rows.map(mapRow);
}

export async function getClient(id: number): Promise<ClientRecord | null> {
  const db = await getDb();
  const rows = await db.select<ClientRow[]>("SELECT * FROM clients WHERE id = $1", [id]);
  return rows.length === 1 ? mapRow(rows[0]) : null;
}

export async function createClient(input: NewClient): Promise<ClientRecord> {
  const db = await getDb();
  const result = await db.execute(
    `INSERT INTO clients (name, nif_cif, vat_number, address, email, phone, notes, invoice_prefix, vat_treatment, invoice_language, country)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      input.name,
      input.nifCif,
      input.vatNumber,
      input.address,
      input.email,
      input.phone,
      input.notes,
      input.invoicePrefix,
      input.vatTreatment,
      input.invoiceLanguage,
      input.country,
    ],
  );
  const created = await getClient(result.lastInsertId!);
  if (!created) throw new Error("Failed to load client after insert");
  return created;
}

const COLUMN_BY_KEY: Record<keyof NewClient, string> = {
  name: "name",
  nifCif: "nif_cif",
  vatNumber: "vat_number",
  address: "address",
  email: "email",
  phone: "phone",
  notes: "notes",
  invoicePrefix: "invoice_prefix",
  vatTreatment: "vat_treatment",
  invoiceLanguage: "invoice_language",
  country: "country",
};

export async function updateClient(id: number, patch: Partial<NewClient>): Promise<void> {
  const entries = Object.entries(patch) as [keyof NewClient, unknown][];
  if (entries.length === 0) return;

  const db = await getDb();
  const setClause = entries.map(([key], i) => `${COLUMN_BY_KEY[key]} = $${i + 1}`).join(", ");
  const values = entries.map(([, value]) => value);
  await db.execute(`UPDATE clients SET ${setClause} WHERE id = $${entries.length + 1}`, [...values, id]);
}

export async function deleteClient(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM clients WHERE id = $1", [id]);
}

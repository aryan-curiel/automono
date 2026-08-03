import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getDb } from "./client";

export interface BusinessProfileRecord {
  name: string;
  nifCif: string;
  vatNumber: string;
  address: string;
  bankName: string;
  iban: string;
  bic: string;
  logoPath: string | null;
}

interface BusinessProfileRow {
  name: string;
  nif_cif: string;
  vat_number: string;
  address: string;
  bank_name: string;
  iban: string;
  bic: string;
  logo_path: string | null;
}

function mapRow(row: BusinessProfileRow): BusinessProfileRecord {
  return {
    name: row.name,
    nifCif: row.nif_cif,
    vatNumber: row.vat_number,
    address: row.address,
    bankName: row.bank_name,
    iban: row.iban,
    bic: row.bic,
    logoPath: row.logo_path,
  };
}

export async function getBusinessProfile(): Promise<BusinessProfileRecord> {
  const db = await getDb();
  const rows = await db.select<BusinessProfileRow[]>(
    "SELECT name, nif_cif, vat_number, address, bank_name, iban, bic, logo_path FROM business_profile WHERE id = 1",
  );
  return mapRow(rows[0]);
}

export async function updateBusinessProfile(patch: BusinessProfileRecord): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE business_profile
     SET name = $1, nif_cif = $2, vat_number = $3, address = $4, bank_name = $5, iban = $6, bic = $7, logo_path = $8
     WHERE id = 1`,
    [
      patch.name,
      patch.nifCif,
      patch.vatNumber,
      patch.address,
      patch.bankName,
      patch.iban,
      patch.bic,
      patch.logoPath,
    ],
  );
}

/** Opens the native file picker restricted to common logo image formats. */
export async function pickBusinessLogo(): Promise<string | null> {
  const path = await open({
    multiple: false,
    filters: [{ name: "Logo", extensions: ["png", "jpg", "jpeg"] }],
  });
  return typeof path === "string" ? path : null;
}

/** Copies the file at `sourcePath` into the app data directory as the current business logo. */
export async function attachBusinessLogo(sourcePath: string): Promise<string> {
  return invoke<string>("attach_business_logo_cmd", { sourcePath });
}

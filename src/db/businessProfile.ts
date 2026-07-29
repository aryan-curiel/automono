import { getDb } from "./client";

export interface BusinessProfileRecord {
  name: string;
  nifCif: string;
  vatNumber: string;
  address: string;
  bankName: string;
  iban: string;
  bic: string;
}

interface BusinessProfileRow {
  name: string;
  nif_cif: string;
  vat_number: string;
  address: string;
  bank_name: string;
  iban: string;
  bic: string;
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
  };
}

export async function getBusinessProfile(): Promise<BusinessProfileRecord> {
  const db = await getDb();
  const rows = await db.select<BusinessProfileRow[]>(
    "SELECT name, nif_cif, vat_number, address, bank_name, iban, bic FROM business_profile WHERE id = 1",
  );
  return mapRow(rows[0]);
}

export async function updateBusinessProfile(patch: BusinessProfileRecord): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE business_profile
     SET name = $1, nif_cif = $2, vat_number = $3, address = $4, bank_name = $5, iban = $6, bic = $7
     WHERE id = 1`,
    [patch.name, patch.nifCif, patch.vatNumber, patch.address, patch.bankName, patch.iban, patch.bic],
  );
}

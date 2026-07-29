import { describe, expect, it } from "vitest";
// @ts-expect-error type error without @types/node package
import { DatabaseSync } from "node:sqlite";
// @ts-expect-error type error without @types/node package
import { readdirSync, readFileSync } from "node:fs";
// @ts-expect-error type error without @types/node package
import { dirname, join } from "node:path";
// @ts-expect-error type error without @types/node package
import { fileURLToPath } from "node:url";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../src-tauri/migrations");

function freshDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  const files = (readdirSync(MIGRATIONS_DIR) as string[]).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }
  return db;
}

describe("migrations", () => {
  it("enforces UNIQUE clients.invoice_prefix", () => {
    const db = freshDb();
    db.exec(
      "INSERT INTO clients (name, nif_cif, invoice_prefix, vat_treatment) VALUES ('A', 'X1', 'DUP', 'standard')",
    );
    expect(() =>
      db.exec(
        "INSERT INTO clients (name, nif_cif, invoice_prefix, vat_treatment) VALUES ('B', 'X2', 'DUP', 'standard')",
      ),
    ).toThrow(/UNIQUE constraint failed/);
  });

  it("defaults next_invoice_number and next_rectification_number to 1", () => {
    const db = freshDb();
    db.exec(
      "INSERT INTO clients (name, nif_cif, invoice_prefix, vat_treatment) VALUES ('A', 'X1', 'ABC', 'standard')",
    );
    const row = db
      .prepare(
        "SELECT next_invoice_number, next_rectification_number FROM clients WHERE invoice_prefix = 'ABC'",
      )
      .get() as { next_invoice_number: number; next_rectification_number: number };
    expect(row.next_invoice_number).toBe(1);
    expect(row.next_rectification_number).toBe(1);
  });

  it("allows a regular invoice and a rectification to share series_prefix/invoice_number", () => {
    const db = freshDb();
    db.exec(
      "INSERT INTO clients (name, nif_cif, invoice_prefix, vat_treatment) VALUES ('A', 'X1', 'IMO', 'standard')",
    );
    const clientId = (
      db.prepare("SELECT id FROM clients WHERE invoice_prefix = 'IMO'").get() as { id: number }
    ).id;
    db.exec(
      `INSERT INTO invoices (client_id, series_prefix, invoice_number, status, is_rectification)
       VALUES (${clientId}, 'IMO', 1, 'issued', 0)`,
    );
    expect(() =>
      db.exec(
        `INSERT INTO invoices (client_id, series_prefix, invoice_number, status, is_rectification, rectifies_invoice_id, rectification_type, rectification_reason)
         VALUES (${clientId}, 'IMO', 1, 'issued', 1, 1, 'full', 'motivo')`,
      ),
    ).not.toThrow();
  });

  it("seeds exactly the 4 required vat_note_templates rows", () => {
    const db = freshDb();
    const rows = db
      .prepare(
        "SELECT treatment_code, language FROM vat_note_templates ORDER BY treatment_code, language",
      )
      .all();
    expect(rows).toEqual([
      { treatment_code: "export_outside_eu", language: "en" },
      { treatment_code: "export_outside_eu", language: "es" },
      { treatment_code: "reverse_charge_eu", language: "en" },
      { treatment_code: "reverse_charge_eu", language: "es" },
    ]);
  });
});

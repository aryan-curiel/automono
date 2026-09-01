import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../src-tauri/migrations");

function freshDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }
  return db;
}

describe("migrations", () => {
  it("enforces UNIQUE invoice_series.prefix", () => {
    const db = freshDb();
    db.exec("INSERT INTO invoice_series (prefix) VALUES ('DUP')");
    expect(() => db.exec("INSERT INTO invoice_series (prefix) VALUES ('DUP')")).toThrow(
      /UNIQUE constraint failed/,
    );
  });

  it("defaults next_invoice_number and next_rectification_number to 1", () => {
    const db = freshDb();
    db.exec("INSERT INTO invoice_series (prefix) VALUES ('ABC')");
    const row = db
      .prepare(
        "SELECT next_invoice_number, next_rectification_number FROM invoice_series WHERE prefix = 'ABC'",
      )
      .get() as { next_invoice_number: number; next_rectification_number: number };
    expect(row.next_invoice_number).toBe(1);
    expect(row.next_rectification_number).toBe(1);
  });

  it("allows a regular invoice and a rectification to share series_prefix/invoice_number", () => {
    const db = freshDb();
    db.exec("INSERT INTO invoice_series (prefix) VALUES ('IMO')");
    const seriesId = (
      db.prepare("SELECT id FROM invoice_series WHERE prefix = 'IMO'").get() as { id: number }
    ).id;
    db.exec(
      `INSERT INTO clients (name, nif_cif, series_id, vat_treatment) VALUES ('A', 'X1', ${seriesId}, 'standard')`,
    );
    const clientId = (
      db.prepare("SELECT id FROM clients WHERE series_id = ?").get(seriesId) as { id: number }
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

  it("adds a nullable expenses.paid_date and a preferences.criterio_caja defaulting to 0", () => {
    const db = freshDb();
    const paidDate = (
      db.prepare("PRAGMA table_info(expenses)").all() as { name: string; notnull: number }[]
    ).find((c) => c.name === "paid_date");
    expect(paidDate).toBeDefined();
    expect(paidDate!.notnull).toBe(0);

    const row = db.prepare("SELECT criterio_caja FROM preferences WHERE id = 1").get() as {
      criterio_caja: number;
    };
    expect(row.criterio_caja).toBe(0);
  });

  it("adds invoices.amount_paid (default 0) and a nullable invoices.paid_date, and lets an issued invoice take a payment", () => {
    const db = freshDb();
    db.exec("INSERT INTO invoice_series (prefix) VALUES ('PAY')");
    const seriesId = (
      db.prepare("SELECT id FROM invoice_series WHERE prefix = 'PAY'").get() as { id: number }
    ).id;
    db.exec(
      `INSERT INTO clients (name, nif_cif, series_id, vat_treatment) VALUES ('A', 'X1', ${seriesId}, 'standard')`,
    );
    const clientId = (
      db.prepare("SELECT id FROM clients WHERE series_id = ?").get(seriesId) as { id: number }
    ).id;
    db.exec(
      `INSERT INTO invoices (client_id, series_prefix, invoice_number, status, is_rectification, total)
       VALUES (${clientId}, 'PAY', 1, 'issued', 0, 100)`,
    );

    const cols = db.prepare("PRAGMA table_info(invoices)").all() as {
      name: string;
      notnull: number;
      dflt_value: string | null;
    }[];
    const amountPaid = cols.find((c) => c.name === "amount_paid");
    expect(amountPaid).toMatchObject({ notnull: 1, dflt_value: "0" });
    expect(cols.find((c) => c.name === "paid_date")).toMatchObject({ notnull: 0 });

    // The 0008 immutability trigger must not block a partial payment on an issued invoice.
    expect(() =>
      db.exec(
        "UPDATE invoices SET amount_paid = 40, paid_date = '2026-03-01' WHERE series_prefix = 'PAY'",
      ),
    ).not.toThrow();
    // ...nor flipping it to paid once settled.
    expect(() =>
      db.exec(
        "UPDATE invoices SET amount_paid = 100, paid_date = '2026-03-05', status = 'paid' WHERE series_prefix = 'PAY'",
      ),
    ).not.toThrow();
  });
});

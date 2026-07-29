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

function seedClient(db: DatabaseSync) {
  db.exec(
    "INSERT INTO clients (name, nif_cif, invoice_prefix, vat_treatment) VALUES ('A', 'X1', 'AAA', 'standard')",
  );
}

// Mirrors the query in listInvoices() (src/db/invoices.ts) — this file can't
// import that function directly since it goes through the Tauri SQL plugin,
// which only exists at app runtime, not in this node:sqlite test harness.
const LIST_INVOICES_SQL = `
  SELECT invoices.*,
    clients.name AS live_client_name,
    clients.nif_cif AS live_client_nif,
    clients.address AS live_client_address,
    (SELECT id FROM invoices r WHERE r.rectifies_invoice_id = invoices.id) AS rectified_by_invoice_id,
    COALESCE(SUM(invoice_lines.quantity * invoice_lines.unit_price), 0) AS lines_subtotal
  FROM invoices
  JOIN clients ON clients.id = invoices.client_id
  LEFT JOIN invoice_lines ON invoice_lines.invoice_id = invoices.id
  GROUP BY invoices.id
  ORDER BY invoices.id DESC
`;

describe("invoices numbering constraint", () => {
  it("allows multiple drafts with NULL series_prefix/invoice_number to coexist", () => {
    const db = freshDb();
    seedClient(db);
    db.exec("INSERT INTO invoices (client_id, status) VALUES (1, 'draft')");
    expect(() => db.exec("INSERT INTO invoices (client_id, status) VALUES (1, 'draft')")).not.toThrow();
  });

  it("rejects a duplicate real series_prefix/invoice_number pair", () => {
    const db = freshDb();
    seedClient(db);
    db.exec(
      "INSERT INTO invoices (client_id, status, series_prefix, invoice_number) VALUES (1, 'issued', 'AAA', 1)",
    );
    expect(() =>
      db.exec(
        "INSERT INTO invoices (client_id, status, series_prefix, invoice_number) VALUES (1, 'issued', 'AAA', 1)",
      ),
    ).toThrow(/UNIQUE constraint failed/);
  });
});

describe("invoice immutability triggers", () => {
  it("allows editing a draft invoice's amounts", () => {
    const db = freshDb();
    seedClient(db);
    db.exec("INSERT INTO invoices (client_id, status) VALUES (1, 'draft')");
    expect(() => db.exec("UPDATE invoices SET total = 50 WHERE id = 1")).not.toThrow();
  });

  it("blocks editing an issued invoice's amounts", () => {
    const db = freshDb();
    seedClient(db);
    db.exec(
      "INSERT INTO invoices (client_id, status, series_prefix, invoice_number, total) VALUES (1, 'issued', 'AAA', 1, 100)",
    );
    expect(() => db.exec("UPDATE invoices SET total = 999 WHERE id = 1")).toThrow(
      /issued invoices are immutable/,
    );
  });

  it("blocks flipping an issued invoice back to draft", () => {
    const db = freshDb();
    seedClient(db);
    db.exec(
      "INSERT INTO invoices (client_id, status, series_prefix, invoice_number) VALUES (1, 'issued', 'AAA', 1)",
    );
    expect(() => db.exec("UPDATE invoices SET status = 'draft' WHERE id = 1")).toThrow(
      /issued invoices are immutable/,
    );
  });

  it("allows adding/editing/deleting line items while the invoice is a draft", () => {
    const db = freshDb();
    seedClient(db);
    db.exec("INSERT INTO invoices (client_id, status) VALUES (1, 'draft')");
    expect(() =>
      db.exec(
        "INSERT INTO invoice_lines (invoice_id, description, quantity, unit_price, total) VALUES (1, 'work', 1, 10, 10)",
      ),
    ).not.toThrow();
    expect(() => db.exec("UPDATE invoice_lines SET description = 'renamed' WHERE invoice_id = 1")).not.toThrow();
    expect(() => db.exec("DELETE FROM invoice_lines WHERE invoice_id = 1")).not.toThrow();
  });

  it("blocks adding/editing/deleting line items once the invoice is issued", () => {
    const db = freshDb();
    seedClient(db);
    db.exec("INSERT INTO invoices (client_id, status) VALUES (1, 'draft')");
    db.exec(
      "INSERT INTO invoice_lines (invoice_id, description, quantity, unit_price, total) VALUES (1, 'work', 1, 10, 10)",
    );
    db.exec(
      "UPDATE invoices SET status = 'issued', series_prefix = 'AAA', invoice_number = 1 WHERE id = 1",
    );
    expect(() =>
      db.exec(
        "INSERT INTO invoice_lines (invoice_id, description, quantity, unit_price, total) VALUES (1, 'extra', 1, 1, 1)",
      ),
    ).toThrow(/cannot add line items/);
    expect(() => db.exec("UPDATE invoice_lines SET description = 'renamed' WHERE invoice_id = 1")).toThrow(
      /cannot edit line items/,
    );
    expect(() => db.exec("DELETE FROM invoice_lines WHERE invoice_id = 1")).toThrow(
      /cannot delete line items/,
    );
  });
});

describe("listInvoices query", () => {
  it("computes a draft's total from its lines and stored rates", () => {
    const db = freshDb();
    seedClient(db);
    db.exec("INSERT INTO invoices (client_id, status, iva_rate, irpf_rate) VALUES (1, 'draft', 21, 15)");
    db.exec(
      "INSERT INTO invoice_lines (invoice_id, description, quantity, unit_price, total) VALUES (1, 'work', 2, 100, 200)",
    );
    const [row] = db.prepare(LIST_INVOICES_SQL).all() as Record<string, unknown>[];
    expect(row.lines_subtotal).toBe(200);
    expect(row.subtotal).toBeNull();
    expect(row.total).toBeNull();
  });

  it("prefers the client name snapshot over the live client row once issued", () => {
    const db = freshDb();
    seedClient(db);
    db.exec(
      `INSERT INTO invoices (client_id, status, series_prefix, invoice_number, client_name_snapshot, subtotal, total)
       VALUES (1, 'issued', 'AAA', 1, 'Old Name', 100, 100)`,
    );
    db.exec("UPDATE clients SET name = 'New Name' WHERE id = 1");
    const [row] = db.prepare(LIST_INVOICES_SQL).all() as Record<string, unknown>[];
    expect(row.client_name_snapshot).toBe("Old Name");
    expect(row.live_client_name).toBe("New Name");
  });

  it("resolves rectified_by_invoice_id for a rectified original", () => {
    const db = freshDb();
    seedClient(db);
    db.exec(
      "INSERT INTO invoices (client_id, status, series_prefix, invoice_number) VALUES (1, 'issued', 'AAA', 1)",
    );
    db.exec(
      `INSERT INTO invoices (client_id, status, series_prefix, invoice_number, is_rectification, rectifies_invoice_id)
       VALUES (1, 'issued', 'AAA', 2, 1, 1)`,
    );
    const rows = db.prepare(LIST_INVOICES_SQL).all() as Record<string, unknown>[];
    const original = rows.find((r) => r.id === 1)!;
    const rectification = rows.find((r) => r.id === 2)!;
    expect(original.rectified_by_invoice_id).toBe(2);
    expect(rectification.rectifies_invoice_id).toBe(1);
  });
});

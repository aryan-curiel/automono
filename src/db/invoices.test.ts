import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../src-tauri/migrations");

function freshDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }
  return db;
}

function seedClient(db: DatabaseSync) {
  db.exec("INSERT INTO invoice_series (prefix) VALUES ('AAA')");
  db.exec(
    "INSERT INTO clients (name, nif_cif, series_id, vat_treatment) VALUES ('A', 'X1', 1, 'standard')",
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

// Mirrors SELECT_INVOICE in src/db/invoices.ts (see LIST_INVOICES_SQL comment above for why).
const SELECT_INVOICE_SQL = `
  SELECT invoices.*,
    clients.name AS live_client_name,
    clients.nif_cif AS live_client_nif,
    clients.vat_number AS live_client_vat_number,
    clients.address AS live_client_address,
    clients.vat_treatment AS live_client_vat_treatment,
    (SELECT id FROM invoices r WHERE r.rectifies_invoice_id = invoices.id) AS rectified_by_invoice_id,
    (SELECT note_text FROM vat_note_templates
     WHERE treatment_code = clients.vat_treatment
       AND language = COALESCE(invoices.language, 'es')) AS live_vat_note_text_in_language,
    (SELECT note_text FROM vat_note_templates
     WHERE treatment_code = clients.vat_treatment AND language = 'es') AS live_vat_note_text_es
  FROM invoices
  JOIN clients ON clients.id = invoices.client_id
`;

describe("getInvoice query (invoice preview data)", () => {
  it("falls back to the live client's vat_treatment and the note template for an unissued draft", () => {
    const db = freshDb();
    seedClient(db);
    db.exec(
      "INSERT INTO clients (name, nif_cif, series_id, vat_treatment) VALUES ('B', 'X2', 1, 'reverse_charge_eu')",
    );
    db.exec("INSERT INTO invoices (client_id, status, language) VALUES (2, 'draft', 'en')");
    const [row] = db.prepare(SELECT_INVOICE_SQL).all() as Record<string, unknown>[];
    expect(row.vat_treatment).toBeNull();
    expect(row.live_client_vat_treatment).toBe("reverse_charge_eu");
    expect(row.live_vat_note_text_in_language).toMatch(/reverse charged/);
  });
});

describe("invoices numbering constraint", () => {
  it("allows multiple drafts with NULL series_prefix/invoice_number to coexist", () => {
    const db = freshDb();
    seedClient(db);
    db.exec("INSERT INTO invoices (client_id, status) VALUES (1, 'draft')");
    expect(() =>
      db.exec("INSERT INTO invoices (client_id, status) VALUES (1, 'draft')"),
    ).not.toThrow();
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

  it("deleting a draft invoice removes it", () => {
    const db = freshDb();
    seedClient(db);
    db.exec("INSERT INTO invoices (client_id, status) VALUES (1, 'draft')");
    const result = db.prepare("DELETE FROM invoices WHERE id = 1 AND status = 'draft'").run();
    expect(result.changes).toBe(1);
    expect(db.prepare("SELECT * FROM invoices WHERE id = 1").all()).toHaveLength(0);
  });

  it("the draft-only guard leaves an issued invoice untouched", () => {
    const db = freshDb();
    seedClient(db);
    db.exec(
      "INSERT INTO invoices (client_id, status, series_prefix, invoice_number) VALUES (1, 'issued', 'AAA', 1)",
    );
    const result = db.prepare("DELETE FROM invoices WHERE id = 1 AND status = 'draft'").run();
    expect(result.changes).toBe(0);
    expect(db.prepare("SELECT * FROM invoices WHERE id = 1").all()).toHaveLength(1);
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
    expect(() =>
      db.exec("UPDATE invoice_lines SET description = 'renamed' WHERE invoice_id = 1"),
    ).not.toThrow();
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
    expect(() =>
      db.exec("UPDATE invoice_lines SET description = 'renamed' WHERE invoice_id = 1"),
    ).toThrow(/cannot edit line items/);
    expect(() => db.exec("DELETE FROM invoice_lines WHERE invoice_id = 1")).toThrow(
      /cannot delete line items/,
    );
  });
});

describe("listInvoices query", () => {
  it("computes a draft's total from its lines and stored rates", () => {
    const db = freshDb();
    seedClient(db);
    db.exec(
      "INSERT INTO invoices (client_id, status, iva_rate, irpf_rate) VALUES (1, 'draft', 21, 15)",
    );
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

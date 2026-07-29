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

describe("clients constraints", () => {
  it("enforces UNIQUE invoice_prefix on UPDATE, not just INSERT", () => {
    const db = freshDb();
    db.exec(
      "INSERT INTO clients (name, nif_cif, invoice_prefix, vat_treatment) VALUES ('A', 'X1', 'AAA', 'standard')",
    );
    db.exec(
      "INSERT INTO clients (name, nif_cif, invoice_prefix, vat_treatment) VALUES ('B', 'X2', 'BBB', 'standard')",
    );
    expect(() =>
      db.exec("UPDATE clients SET invoice_prefix = 'AAA' WHERE invoice_prefix = 'BBB'"),
    ).toThrow(/UNIQUE constraint failed/);
  });

  it("restricts deleting a client that has invoices", () => {
    const db = freshDb();
    db.exec(
      "INSERT INTO clients (name, nif_cif, invoice_prefix, vat_treatment) VALUES ('A', 'X1', 'AAA', 'standard')",
    );
    db.exec("INSERT INTO invoices (client_id) VALUES (1)");
    expect(() => db.exec("DELETE FROM clients WHERE id = 1")).toThrow(
      /FOREIGN KEY constraint failed/,
    );
  });

  it("cascades contract deletion when the client is deleted", () => {
    const db = freshDb();
    db.exec(
      "INSERT INTO clients (name, nif_cif, invoice_prefix, vat_treatment) VALUES ('A', 'X1', 'AAA', 'standard')",
    );
    db.exec("INSERT INTO contracts (client_id, title) VALUES (1, 'Contract A')");
    db.exec("DELETE FROM clients WHERE id = 1");
    const row = db.prepare("SELECT COUNT(*) AS count FROM contracts").get() as { count: number };
    expect(row.count).toBe(0);
  });
});

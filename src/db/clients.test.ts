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

function insertClient(db: DatabaseSync, name: string, prefix: string): number {
  db.exec(`INSERT INTO invoice_series (prefix) VALUES ('${prefix}')`);
  const seriesId = (db.prepare("SELECT last_insert_rowid() AS id").get() as { id: number }).id;
  db.exec(
    `INSERT INTO clients (name, nif_cif, series_id, vat_treatment) VALUES ('${name}', 'X1', ${seriesId}, 'standard')`,
  );
  return (db.prepare("SELECT last_insert_rowid() AS id").get() as { id: number }).id;
}

describe("clients constraints", () => {
  it("enforces UNIQUE invoice_series.prefix on UPDATE, not just INSERT", () => {
    const db = freshDb();
    db.exec("INSERT INTO invoice_series (prefix) VALUES ('AAA')");
    db.exec("INSERT INTO invoice_series (prefix) VALUES ('BBB')");
    expect(() => db.exec("UPDATE invoice_series SET prefix = 'AAA' WHERE prefix = 'BBB'")).toThrow(
      /UNIQUE constraint failed/,
    );
  });

  it("restricts deleting a client that has invoices", () => {
    const db = freshDb();
    const clientId = insertClient(db, "A", "AAA");
    db.exec(`INSERT INTO invoices (client_id) VALUES (${clientId})`);
    expect(() => db.exec(`DELETE FROM clients WHERE id = ${clientId}`)).toThrow(
      /FOREIGN KEY constraint failed/,
    );
  });

  it("cascades contract deletion when the client is deleted", () => {
    const db = freshDb();
    const clientId = insertClient(db, "A", "AAA");
    db.exec(`INSERT INTO contracts (client_id, title) VALUES (${clientId}, 'Contract A')`);
    db.exec(`DELETE FROM clients WHERE id = ${clientId}`);
    const row = db.prepare("SELECT COUNT(*) AS count FROM contracts").get() as { count: number };
    expect(row.count).toBe(0);
  });

  it("allows multiple clients to share the same series_id", () => {
    const db = freshDb();
    db.exec("INSERT INTO invoice_series (prefix) VALUES ('ACP')");
    const seriesId = (
      db.prepare("SELECT id FROM invoice_series WHERE prefix = 'ACP'").get() as { id: number }
    ).id;
    db.exec(
      `INSERT INTO clients (name, nif_cif, series_id, vat_treatment) VALUES ('A', 'X1', ${seriesId}, 'standard')`,
    );
    expect(() =>
      db.exec(
        `INSERT INTO clients (name, nif_cif, series_id, vat_treatment) VALUES ('B', 'X2', ${seriesId}, 'standard')`,
      ),
    ).not.toThrow();
    const row = db
      .prepare("SELECT COUNT(*) AS count FROM clients WHERE series_id = ?")
      .get(seriesId) as { count: number };
    expect(row.count).toBe(2);
  });
});

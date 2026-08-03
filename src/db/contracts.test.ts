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

function insertClient(db: DatabaseSync, name: string, prefix: string): number {
  db.exec(`INSERT INTO invoice_series (prefix) VALUES ('${prefix}')`);
  const seriesId = (db.prepare("SELECT last_insert_rowid() AS id").get() as { id: number }).id;
  db.exec(
    `INSERT INTO clients (name, nif_cif, series_id, vat_treatment) VALUES ('${name}', 'X1', ${seriesId}, 'standard')`,
  );
  return (db.prepare("SELECT last_insert_rowid() AS id").get() as { id: number }).id;
}

describe("contracts", () => {
  it("creates a contract with the expected defaults", () => {
    const db = freshDb();
    const clientId = insertClient(db, "Acme", "ACM");
    db.exec(`INSERT INTO contracts (client_id, title) VALUES (${clientId}, 'Service agreement')`);
    const row = db.prepare("SELECT * FROM contracts").get() as {
      status: string;
      file_path: string | null;
    };
    expect(row.status).toBe("active");
    expect(row.file_path).toBeNull();
  });

  it("rejects an invalid status via the CHECK constraint", () => {
    const db = freshDb();
    const clientId = insertClient(db, "Acme", "ACM");
    expect(() =>
      db.exec(
        `INSERT INTO contracts (client_id, title, status) VALUES (${clientId}, 'Bad', 'cancelled')`,
      ),
    ).toThrow(/CHECK constraint failed/);
  });

  it("filters by client_id and by status", () => {
    const db = freshDb();
    const clientA = insertClient(db, "A", "AAA");
    const clientB = insertClient(db, "B", "BBB");
    db.exec(`INSERT INTO contracts (client_id, title, status) VALUES (${clientA}, 'A1', 'active')`);
    db.exec(
      `INSERT INTO contracts (client_id, title, status) VALUES (${clientA}, 'A2', 'expired')`,
    );
    db.exec(`INSERT INTO contracts (client_id, title, status) VALUES (${clientB}, 'B1', 'active')`);

    const forClientA = db
      .prepare("SELECT title FROM contracts WHERE client_id = ?")
      .all(clientA) as {
      title: string;
    }[];
    expect(forClientA.map((r) => r.title).sort()).toEqual(["A1", "A2"]);

    const active = db.prepare("SELECT title FROM contracts WHERE status = ?").all("active") as {
      title: string;
    }[];
    expect(active.map((r) => r.title).sort()).toEqual(["A1", "B1"]);

    const activeForClientA = db
      .prepare("SELECT title FROM contracts WHERE client_id = ? AND status = ?")
      .all(clientA, "active") as { title: string }[];
    expect(activeForClientA.map((r) => r.title)).toEqual(["A1"]);
  });

  it("updates and deletes a contract", () => {
    const db = freshDb();
    const clientId = insertClient(db, "Acme", "ACM");
    db.exec(`INSERT INTO contracts (client_id, title) VALUES (${clientId}, 'Original title')`);
    const id = (db.prepare("SELECT id FROM contracts").get() as { id: number }).id;

    db.exec(`UPDATE contracts SET title = 'Renamed', status = 'terminated' WHERE id = ${id}`);
    const updated = db.prepare("SELECT title, status FROM contracts WHERE id = ?").get(id) as {
      title: string;
      status: string;
    };
    expect(updated.title).toBe("Renamed");
    expect(updated.status).toBe("terminated");

    db.exec(`DELETE FROM contracts WHERE id = ${id}`);
    const count = (db.prepare("SELECT COUNT(*) AS count FROM contracts").get() as { count: number })
      .count;
    expect(count).toBe(0);
  });
});

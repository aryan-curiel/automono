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

// Mirrors deleteDeclaration's guarded DELETE — run directly against the migrated schema since
// getDb() needs the Tauri runtime and isn't available under vitest.
const DELETE_IN_PROGRESS_SQL =
  "DELETE FROM quarterly_declarations WHERE id = ? AND status = 'in_progress'";

describe("deleteDeclaration guard", () => {
  it("deletes an in-progress declaration", () => {
    const db = freshDb();
    db.exec(
      `INSERT INTO quarterly_declarations (year, quarter, snapshot_json) VALUES (2026, 2, '{}')`,
    );
    db.prepare(DELETE_IN_PROGRESS_SQL).run(1);
    expect(db.prepare("SELECT * FROM quarterly_declarations").all()).toHaveLength(0);
  });

  it("leaves a completed declaration untouched", () => {
    const db = freshDb();
    db.exec(
      `INSERT INTO quarterly_declarations (year, quarter, snapshot_json, status) VALUES (2026, 2, '{}', 'completed')`,
    );
    db.prepare(DELETE_IN_PROGRESS_SQL).run(1);
    expect(db.prepare("SELECT * FROM quarterly_declarations").all()).toHaveLength(1);
  });
});

// Mirrors markDeclarationCompleted's own flagging UPDATE — run directly against the migrated
// schema since getDb() needs the Tauri runtime and isn't available under vitest.
describe("markDeclarationCompleted expense flagging", () => {
  it("flags only the expenses whose ids are in the completed snapshot", () => {
    const db = freshDb();
    db.exec(`INSERT INTO expenses (id, date, amount) VALUES (1, '2026-04-01', 50)`);
    db.exec(`INSERT INTO expenses (id, date, amount) VALUES (2, '2026-04-02', 30)`);
    db.prepare("UPDATE expenses SET declared = 1 WHERE id IN (?)").run(1);
    const rows = db.prepare("SELECT id, declared FROM expenses ORDER BY id").all();
    expect(rows).toEqual([
      { id: 1, declared: 1 },
      { id: 2, declared: 0 },
    ]);
  });
});

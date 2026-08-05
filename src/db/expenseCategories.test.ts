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

function migrationFiles(): string[] {
  return (readdirSync(MIGRATIONS_DIR) as string[]).filter((f: string) => f.endsWith(".sql")).sort();
}

function freshDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  for (const file of migrationFiles()) {
    db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }
  return db;
}

describe("expense_categories", () => {
  it("seeds the default categories", () => {
    const db = freshDb();
    const names = (
      db.prepare("SELECT name FROM expense_categories ORDER BY name").all() as { name: string }[]
    ).map((r) => r.name);
    expect(names).toEqual([
      "Alquiler",
      "Material",
      "Otros",
      "Software",
      "Suministros",
      "Transporte",
    ]);
  });

  it("enforces UNIQUE name", () => {
    const db = freshDb();
    expect(() => db.exec("INSERT INTO expense_categories (name) VALUES ('Otros')")).toThrow(
      /UNIQUE constraint failed/,
    );
  });

  it("backfills a free-text category already used by an existing expense", () => {
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON;");
    const files = migrationFiles();
    const before = files.filter((f) => f < "0020");
    const from020 = files.filter((f) => f >= "0020");
    for (const f of before) db.exec(readFileSync(join(MIGRATIONS_DIR, f), "utf8"));
    db.exec(`INSERT INTO expenses (date, category, amount) VALUES ('2026-01-01', 'Formación', 10)`);
    for (const f of from020) db.exec(readFileSync(join(MIGRATIONS_DIR, f), "utf8"));

    const row = db.prepare("SELECT name FROM expense_categories WHERE name = 'Formación'").get() as
      { name: string } | undefined;
    expect(row?.name).toBe("Formación");
  });
});

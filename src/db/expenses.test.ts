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

describe("expenses", () => {
  it("creates an expense with the expected defaults", () => {
    const db = freshDb();
    db.exec(`INSERT INTO expenses (date, amount) VALUES ('2026-07-15', 42.5)`);
    const row = db.prepare("SELECT * FROM expenses").get() as {
      deductible_pct: number;
      category: string | null;
      iva_amount: number | null;
      receipt_file_path: string | null;
    };
    expect(row.deductible_pct).toBe(100);
    expect(row.category).toBeNull();
    expect(row.iva_amount).toBeNull();
    expect(row.receipt_file_path).toBeNull();
  });

  it("filters by inclusive date range", () => {
    const db = freshDb();
    db.exec(`INSERT INTO expenses (date, amount) VALUES ('2026-06-30', 10)`);
    db.exec(`INSERT INTO expenses (date, amount) VALUES ('2026-07-01', 20)`);
    db.exec(`INSERT INTO expenses (date, amount) VALUES ('2026-07-31', 30)`);
    db.exec(`INSERT INTO expenses (date, amount) VALUES ('2026-08-01', 40)`);

    const inJuly = db
      .prepare("SELECT amount FROM expenses WHERE date >= ? AND date <= ? ORDER BY date")
      .all("2026-07-01", "2026-07-31") as { amount: number }[];
    expect(inJuly.map((r) => r.amount)).toEqual([20, 30]);
  });

  it("updates and deletes an expense", () => {
    const db = freshDb();
    db.exec(
      `INSERT INTO expenses (date, category, amount, deductible_pct) VALUES ('2026-07-15', 'material', 100, 50)`,
    );
    const id = (db.prepare("SELECT id FROM expenses").get() as { id: number }).id;

    db.exec(`UPDATE expenses SET amount = 150, deductible_pct = 75 WHERE id = ${id}`);
    const updated = db
      .prepare("SELECT amount, deductible_pct FROM expenses WHERE id = ?")
      .get(id) as {
      amount: number;
      deductible_pct: number;
    };
    expect(updated.amount).toBe(150);
    expect(updated.deductible_pct).toBe(75);

    db.exec(`DELETE FROM expenses WHERE id = ${id}`);
    const count = (db.prepare("SELECT COUNT(*) AS count FROM expenses").get() as { count: number })
      .count;
    expect(count).toBe(0);
  });

  it("declared_period override moves an expense to a different quarter's declaration", () => {
    const db = freshDb();
    // Dated in Q2 but declared in Q3 (the late-rent scenario).
    db.exec(
      `INSERT INTO expenses (date, amount, declared_period) VALUES ('2026-06-30', 10, '2026-Q3')`,
    );
    // A normal, undeclared-override expense dated in Q3.
    db.exec(`INSERT INTO expenses (date, amount) VALUES ('2026-07-15', 20)`);

    // Mirrors the WHERE clause listExpenses builds when a quarterKeys filter is set.
    const forQuarter = (from: string, to: string, quarterKeys: string[]) =>
      (
        db
          .prepare(
            `SELECT amount FROM expenses
             WHERE (declared_period IS NULL AND date >= ? AND date <= ?)
                OR declared_period IN (${quarterKeys.map(() => "?").join(", ")})
             ORDER BY amount`,
          )
          .all(from, to, ...quarterKeys) as { amount: number }[]
      ).map((r) => r.amount);

    expect(forQuarter("2026-07-01", "2026-09-30", ["2026-Q3"])).toEqual([10, 20]);
    expect(forQuarter("2026-04-01", "2026-06-30", ["2026-Q2"])).toEqual([]);
  });
});

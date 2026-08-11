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

describe("preferences", () => {
  it("seeds a singleton row with onboarding not completed and today's tax-rate defaults", () => {
    const db = freshDb();
    const row = db.prepare("SELECT * FROM preferences WHERE id = 1").get() as {
      theme: string;
      language: string;
      default_iva_rate: number;
      default_irpf_rate: number;
      onboarding_completed: number;
      reta_monthly_cuota: number;
      reta_start_date: string;
    };
    expect(row.theme).toBe("light");
    expect(row.language).toBe("es");
    expect(row.default_iva_rate).toBe(21);
    expect(row.default_irpf_rate).toBe(7);
    expect(row.onboarding_completed).toBe(0);
    expect(row.reta_monthly_cuota).toBe(80);
    expect(row.reta_start_date).toBe("2026-06-01");
  });

  it("rejects a second row via the CHECK(id = 1) constraint", () => {
    const db = freshDb();
    expect(() => db.exec("INSERT INTO preferences (id) VALUES (2)")).toThrow(
      /CHECK constraint failed/,
    );
  });

  it("would mark onboarding already completed for an install with a named business profile", () => {
    // Simulates an existing user's database at the moment 0018_preferences.sql runs: replay every
    // migration up to (not including) it against a business_profile that already has a name, then
    // apply 0018 and confirm the backfill skips onboarding instead of interrupting them.
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON;");
    const files = (readdirSync(MIGRATIONS_DIR) as string[])
      .filter((f: string) => f.endsWith(".sql"))
      .sort();
    for (const file of files) {
      if (file >= "0018_preferences.sql") break;
      db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
    }
    db.exec("UPDATE business_profile SET name = 'Acme Consulting' WHERE id = 1");
    db.exec(readFileSync(join(MIGRATIONS_DIR, "0018_preferences.sql"), "utf8"));
    const row = db.prepare("SELECT onboarding_completed FROM preferences WHERE id = 1").get() as {
      onboarding_completed: number;
    };
    expect(row.onboarding_completed).toBe(1);
  });
});

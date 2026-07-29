import { getDb } from "./client";

export interface HealthcheckResult {
  ok: boolean;
  message: string;
}

export async function runHealthcheck(): Promise<HealthcheckResult> {
  const db = await getDb();
  const note = `ok-${Date.now()}`;
  await db.execute("INSERT INTO _scaffold_check (note) VALUES ($1)", [note]);
  const rows = await db.select<{ id: number; note: string }[]>(
    "SELECT id, note FROM _scaffold_check WHERE note = $1 ORDER BY id DESC LIMIT 1",
    [note],
  );
  const ok = rows.length === 1 && rows[0].note === note;
  return {
    ok,
    message: ok ? `SQLite round-trip OK (row #${rows[0].id})` : "SQLite round-trip failed",
  };
}

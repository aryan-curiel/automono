import { getDb } from "./client";

export interface SeriesRecord {
  id: number;
  prefix: string;
}

export async function listSeries(): Promise<SeriesRecord[]> {
  const db = await getDb();
  return db.select<SeriesRecord[]>("SELECT id, prefix FROM invoice_series ORDER BY prefix");
}

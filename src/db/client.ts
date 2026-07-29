import Database from "@tauri-apps/plugin-sql";

let db: Database | null = null;

export async function getDb(): Promise<Database> {
  db ??= await Database.load("sqlite:automono.db");
  return db;
}

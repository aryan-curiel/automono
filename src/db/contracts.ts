import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getDb } from "./client";
import type { ContractStatus } from "../types";

export interface ContractRecord {
  id: number;
  clientId: number;
  title: string;
  filePath: string | null;
  startDate: string | null;
  endDate: string | null;
  status: ContractStatus;
  notes: string | null;
}

export type NewContract = Omit<ContractRecord, "id">;

interface ContractRow {
  id: number;
  client_id: number;
  title: string;
  file_path: string | null;
  start_date: string | null;
  end_date: string | null;
  status: ContractStatus;
  notes: string | null;
}

function mapRow(row: ContractRow): ContractRecord {
  return {
    id: row.id,
    clientId: row.client_id,
    title: row.title,
    filePath: row.file_path,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    notes: row.notes,
  };
}

export interface ContractFilter {
  clientId?: number;
  status?: ContractStatus;
}

export async function listContracts(filter: ContractFilter = {}): Promise<ContractRecord[]> {
  const db = await getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filter.clientId !== undefined) {
    params.push(filter.clientId);
    conditions.push(`client_id = $${params.length}`);
  }
  if (filter.status !== undefined) {
    params.push(filter.status);
    conditions.push(`status = $${params.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await db.select<ContractRow[]>(
    `SELECT * FROM contracts ${where} ORDER BY start_date DESC, id DESC`,
    params,
  );
  return rows.map(mapRow);
}

export async function getContract(id: number): Promise<ContractRecord | null> {
  const db = await getDb();
  const rows = await db.select<ContractRow[]>("SELECT * FROM contracts WHERE id = $1", [id]);
  return rows.length === 1 ? mapRow(rows[0]) : null;
}

export async function createContract(input: NewContract): Promise<ContractRecord> {
  const db = await getDb();
  const result = await db.execute(
    `INSERT INTO contracts (client_id, title, file_path, start_date, end_date, status, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.clientId,
      input.title,
      input.filePath,
      input.startDate,
      input.endDate,
      input.status,
      input.notes,
    ],
  );
  const created = await getContract(result.lastInsertId!);
  if (!created) throw new Error("Failed to load contract after insert");
  return created;
}

const COLUMN_BY_KEY: Record<keyof NewContract, string> = {
  clientId: "client_id",
  title: "title",
  filePath: "file_path",
  startDate: "start_date",
  endDate: "end_date",
  status: "status",
  notes: "notes",
};

export async function updateContract(id: number, patch: Partial<NewContract>): Promise<void> {
  const entries = Object.entries(patch) as [keyof NewContract, unknown][];
  if (entries.length === 0) return;

  const db = await getDb();
  const setClause = entries.map(([key], i) => `${COLUMN_BY_KEY[key]} = $${i + 1}`).join(", ");
  const values = entries.map(([, value]) => value);
  await db.execute(`UPDATE contracts SET ${setClause} WHERE id = $${entries.length + 1}`, [
    ...values,
    id,
  ]);
}

export async function deleteContract(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM contracts WHERE id = $1", [id]);
}

/** Opens the native file picker; returns the picked absolute path, or null if cancelled. */
export async function pickContractFile(): Promise<string | null> {
  const path = await open({ multiple: false });
  return typeof path === "string" ? path : null;
}

/** Copies the file at `sourcePath` into the app data directory and returns its new stored path. */
export async function attachContractFile(clientId: number, sourcePath: string): Promise<string> {
  return invoke<string>("attach_contract_file_cmd", { clientId, sourcePath });
}

export async function openContractFile(filePath: string): Promise<void> {
  return invoke("open_contract_file_cmd", { filePath });
}

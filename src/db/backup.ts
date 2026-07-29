import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getDb } from "./client";

export interface BackupSettingsRecord {
  folderPath: string;
  retentionDays: number;
  autoBackupEnabled: boolean;
  intervalDays: number;
  lastBackupAt: string | null;
}

interface BackupSettingsRow {
  folder_path: string;
  retention_days: number;
  auto_backup_enabled: number;
  interval_days: number;
  last_backup_at: string | null;
}

function mapRow(row: BackupSettingsRow): BackupSettingsRecord {
  return {
    folderPath: row.folder_path,
    retentionDays: row.retention_days,
    autoBackupEnabled: row.auto_backup_enabled !== 0,
    intervalDays: row.interval_days,
    lastBackupAt: row.last_backup_at,
  };
}

export async function getBackupSettings(): Promise<BackupSettingsRecord> {
  const db = await getDb();
  const rows = await db.select<BackupSettingsRow[]>(
    "SELECT folder_path, retention_days, auto_backup_enabled, interval_days, last_backup_at FROM backup_settings WHERE id = 1",
  );
  return mapRow(rows[0]);
}

export async function updateBackupSettings(
  patch: Omit<BackupSettingsRecord, "lastBackupAt">,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE backup_settings
     SET folder_path = $1, retention_days = $2, auto_backup_enabled = $3, interval_days = $4
     WHERE id = 1`,
    [patch.folderPath, patch.retentionDays, patch.autoBackupEnabled ? 1 : 0, patch.intervalDays],
  );
}

/** Opens the native folder picker; returns the picked absolute path, or null if cancelled. */
export async function pickBackupFolder(): Promise<string | null> {
  const path = await open({ directory: true, multiple: false });
  return typeof path === "string" ? path : null;
}

export interface BackupEntry {
  folderName: string;
  path: string;
}

interface BackupEntryRow {
  folder_name: string;
  path: string;
}

/** Lists `backup-*` snapshots found directly inside `folder`, newest first. */
export async function listBackups(folder: string): Promise<BackupEntry[]> {
  const rows = await invoke<BackupEntryRow[]>("list_backups_cmd", { folder });
  return rows.map((row) => ({ folderName: row.folder_name, path: row.path }));
}

/** Runs a backup now using the configured folder/retention; returns the created backup path. */
export function backupNow(): Promise<string> {
  return invoke<string>("backup_now_cmd");
}

/** Overwrites the current DB and file directories with the contents of `backupFolder`. */
export function restoreFromBackup(backupFolder: string): Promise<void> {
  return invoke("restore_backup_cmd", { backupFolder });
}

/** Best-effort startup catch-up: fires a backup if auto-backup is on and the configured
 * interval has elapsed since the last one. Swallows errors — a failure here must never block
 * app startup or show an alarming error on every launch. */
export async function checkAutoBackup(): Promise<void> {
  try {
    const settings = await getBackupSettings();
    if (!settings.autoBackupEnabled || !settings.folderPath) return;
    if (settings.lastBackupAt) {
      const elapsedMs = Date.now() - new Date(settings.lastBackupAt).getTime();
      const intervalMs = settings.intervalDays * 24 * 60 * 60 * 1000;
      if (elapsedMs < intervalMs) return;
    }
    await backupNow();
  } catch {
    // best-effort
  }
}

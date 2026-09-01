use std::io;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{Row, SqlitePool};
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_sql::{DbInstances, DbPool};

const DB_NAME: &str = "sqlite:automono.db";
const DB_FILE_NAME: &str = "automono.db";
const CONTEXT_FILE_NAME: &str = "contexto_usuario.md";
const MANIFEST_FILE_NAME: &str = "manifest.json";
const BACKUP_SUBDIRS: [&str; 6] = [
    "contracts",
    "expenses",
    "invoices",
    "declarations",
    "documentos_autonomo",
    "branding",
];

struct BackupSettings {
    folder_path: String,
    retention_days: i64,
    auto_backup_enabled: bool,
    interval_days: i64,
    last_backup_at: Option<String>,
}

/// Core tables every real AutoMono database has — used to reject a restore from a truncated,
/// half-written, or foreign SQLite file that would otherwise pass a bare `is_file()` check.
const CORE_TABLES: [&str; 2] = ["clients", "invoices"];

async fn pool_from_app(app: &AppHandle) -> Option<SqlitePool> {
    let instances = app.state::<DbInstances>();
    let guard = instances.0.read().await;
    match guard.get(DB_NAME) {
        Some(DbPool::Sqlite(pool)) => Some(pool.clone()),
        _ => None,
    }
}

async fn load_backup_settings(pool: &SqlitePool) -> Result<BackupSettings, sqlx::Error> {
    let row = sqlx::query(
        "SELECT folder_path, retention_days, auto_backup_enabled, interval_days, last_backup_at \
         FROM backup_settings WHERE id = 1",
    )
    .fetch_one(pool)
    .await?;
    Ok(BackupSettings {
        folder_path: row.get("folder_path"),
        retention_days: row.get("retention_days"),
        auto_backup_enabled: row.get::<i64, _>("auto_backup_enabled") != 0,
        interval_days: row.get("interval_days"),
        last_backup_at: row.get("last_backup_at"),
    })
}

/// True when a scheduled backup should run: auto-backup is enabled and either there is no
/// prior backup or the last one predates `cutoff`. `last_backup_at` and `cutoff` must share
/// the `%Y-%m-%dT%H:%M:%SZ` format so a lexicographic compare is a correct age compare.
fn backup_is_due(enabled: bool, last_backup_at: Option<&str>, cutoff: &str) -> bool {
    enabled && last_backup_at.is_none_or(|t| t < cutoff)
}

/// Recursively copies `src` into `dst`, creating directories as needed and preserving relative
/// structure and original filenames (unlike `contracts::copy_into`, which stamps a single file
/// with a timestamp — backups need original names to remain restorable).
fn copy_dir_recursive(src: &Path, dst: &Path) -> io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let dest_path = dst.join(entry.file_name());
        if file_type.is_dir() {
            copy_dir_recursive(&entry.path(), &dest_path)?;
        } else if file_type.is_file() {
            std::fs::copy(entry.path(), &dest_path)?;
        }
    }
    Ok(())
}

/// One entry in `manifest.json` — a file the snapshot contains, keyed by its path relative to
/// the `backup-<ts>/` root (forward-slash separated; macOS is the only supported target).
#[derive(Serialize, Deserialize)]
struct ManifestEntry {
    path: String,
    size: u64,
    sha256: String,
}

/// Streams `path` through SHA-256, returning the lowercase hex digest.
fn sha256_file(path: &Path) -> io::Result<String> {
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

/// Collects every file under `dir` recursively as paths relative to `base`, skipping the
/// manifest file itself.
fn collect_files_relative(dir: &Path, base: &Path, out: &mut Vec<PathBuf>) -> io::Result<()> {
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if entry.file_type()?.is_dir() {
            collect_files_relative(&path, base, out)?;
        } else if entry.file_type()?.is_file() {
            let rel = path.strip_prefix(base).unwrap_or(&path).to_path_buf();
            if rel.to_string_lossy() != MANIFEST_FILE_NAME {
                out.push(rel);
            }
        }
    }
    Ok(())
}

/// Writes `manifest.json` into `backup_dir` recording path/size/sha256 for every file the
/// snapshot contains — the DB plus every copied attachment. On restore, `verify_manifest`
/// re-checks each entry before any live data is touched.
fn write_manifest(backup_dir: &Path) -> Result<(), String> {
    let mut files = Vec::new();
    collect_files_relative(backup_dir, backup_dir, &mut files).map_err(|e| e.to_string())?;
    files.sort();
    let mut entries = Vec::with_capacity(files.len());
    for rel in files {
        let abs = backup_dir.join(&rel);
        let size = std::fs::metadata(&abs).map_err(|e| e.to_string())?.len();
        let sha256 = sha256_file(&abs).map_err(|e| e.to_string())?;
        entries.push(ManifestEntry {
            path: rel.to_string_lossy().replace('\\', "/"),
            size,
            sha256,
        });
    }
    let json = serde_json::to_string_pretty(&entries).map_err(|e| e.to_string())?;
    std::fs::write(backup_dir.join(MANIFEST_FILE_NAME), json).map_err(|e| e.to_string())
}

/// Verifies every file listed in `backup_dir/manifest.json` exists with a matching size and
/// SHA-256. Returns `Err` naming the first file that is missing, wrong-sized, or mismatched.
fn verify_manifest(backup_dir: &Path) -> Result<(), String> {
    let raw = std::fs::read(backup_dir.join(MANIFEST_FILE_NAME)).map_err(|e| e.to_string())?;
    let entries: Vec<ManifestEntry> = serde_json::from_slice(&raw)
        .map_err(|_| "El manifiesto de la copia de seguridad está dañado".to_string())?;
    for entry in &entries {
        let path = backup_dir.join(&entry.path);
        let meta = std::fs::metadata(&path).map_err(|_| {
            format!(
                "La copia de seguridad está incompleta: falta el archivo «{}»",
                entry.path
            )
        })?;
        if meta.len() != entry.size {
            return Err(format!(
                "La copia de seguridad está dañada: el archivo «{}» tiene un tamaño incorrecto",
                entry.path
            ));
        }
        if sha256_file(&path).map_err(|e| e.to_string())? != entry.sha256 {
            return Err(format!(
                "La copia de seguridad está dañada: la suma de verificación del archivo «{}» no coincide",
                entry.path
            ));
        }
    }
    Ok(())
}

/// Writes a consistent snapshot of the live database to `dest_db_path` via SQLite's
/// `VACUUM INTO`. Safe regardless of journal mode and concurrent readers, unlike a plain
/// `fs::copy` of the db file which can grab a torn WAL state.
async fn backup_db(pool: &SqlitePool, dest_db_path: &Path) -> Result<(), sqlx::Error> {
    let dest = dest_db_path.to_string_lossy().to_string();
    sqlx::query("VACUUM INTO ?").bind(dest).execute(pool).await?;
    Ok(())
}

/// Removes `backup-<timestamp>` subdirectories of `dest_root` whose timestamp sorts before
/// `cutoff` (both use the same zero-padded `YYYY-MM-DDTHH-MM-SS` format, so a lexicographic
/// compare is a correct age comparison).
fn prune_old_backups(dest_root: &Path, cutoff: &str) -> io::Result<()> {
    let entries = match std::fs::read_dir(dest_root) {
        Ok(e) => e,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(e),
    };
    for entry in entries {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if let Some(ts) = name.strip_prefix("backup-") {
            if ts < cutoff {
                std::fs::remove_dir_all(entry.path())?;
            }
        }
    }
    Ok(())
}

/// Runs one full backup: a DB snapshot plus the three app_data_dir subtrees, into a new
/// `<dest_root>/backup-<timestamp>/` folder, then prunes anything older than `retention_days`.
/// `retention_days <= 0` means "keep forever" (pruning is skipped), not "delete everything".
async fn run_backup(
    app: &AppHandle,
    pool: &SqlitePool,
    dest_root: &Path,
    retention_days: i64,
) -> Result<PathBuf, String> {
    let ts: String = sqlx::query_scalar("SELECT strftime('%Y-%m-%dT%H-%M-%S','now')")
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    let backup_dir = dest_root.join(format!("backup-{ts}"));
    std::fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;

    backup_db(pool, &backup_dir.join(DB_FILE_NAME))
        .await
        .map_err(|e| e.to_string())?;

    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    for sub in BACKUP_SUBDIRS {
        let src = data_dir.join(sub);
        if src.exists() {
            copy_dir_recursive(&src, &backup_dir.join(sub)).map_err(|e| e.to_string())?;
        }
    }
    let context_src = data_dir.join(CONTEXT_FILE_NAME);
    if context_src.is_file() {
        std::fs::copy(&context_src, backup_dir.join(CONTEXT_FILE_NAME)).map_err(|e| e.to_string())?;
    }

    write_manifest(&backup_dir)?;

    sqlx::query(
        "UPDATE backup_settings SET last_backup_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = 1",
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    if retention_days > 0 {
        let cutoff: String = sqlx::query_scalar(
            "SELECT strftime('%Y-%m-%dT%H-%M-%S','now', '-' || ? || ' days')",
        )
        .bind(retention_days)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
        prune_old_backups(dest_root, &cutoff).map_err(|e| e.to_string())?;
    }

    Ok(backup_dir)
}

/// Best-effort backup fired from `on_window_event`'s `CloseRequested`, which blocks the window
/// from closing until this returns — bounded by a timeout so an unreachable backup folder (e.g.
/// a disconnected network share) can't hang app shutdown indefinitely.
pub async fn backup_on_close(app: &AppHandle) {
    let Some(pool) = pool_from_app(app).await else {
        return;
    };
    let Ok(settings) = load_backup_settings(&pool).await else {
        return;
    };
    if settings.folder_path.trim().is_empty() {
        return;
    }
    // Only run on close when a scheduled backup is actually due — the same cadence gate the
    // startup catch-up (`checkAutoBackup`) applies. Without this, every quit re-copies every
    // attachment tree from scratch and blocks shutdown for up to 10s.
    let cutoff: Option<String> =
        sqlx::query_scalar("SELECT strftime('%Y-%m-%dT%H:%M:%SZ','now','-' || ? || ' days')")
            .bind(settings.interval_days)
            .fetch_one(&pool)
            .await
            .ok();
    let Some(cutoff) = cutoff else {
        return;
    };
    if !backup_is_due(
        settings.auto_backup_enabled,
        settings.last_backup_at.as_deref(),
        &cutoff,
    ) {
        return;
    }
    let backup = run_backup(app, &pool, Path::new(&settings.folder_path), settings.retention_days);
    match tokio::time::timeout(Duration::from_secs(10), backup).await {
        Ok(Err(e)) => eprintln!("backup on close failed: {e}"),
        Err(_) => eprintln!("backup on close timed out after 10s"),
        Ok(Ok(_)) => {}
    }
}

#[tauri::command]
pub async fn backup_now_cmd(app: AppHandle) -> Result<String, String> {
    let pool = pool_from_app(&app).await.ok_or("database not loaded")?;
    let settings = load_backup_settings(&pool).await.map_err(|e| e.to_string())?;
    if settings.folder_path.trim().is_empty() {
        return Err("No se ha configurado una carpeta de copia de seguridad".into());
    }
    let backup_dir = run_backup(&app, &pool, Path::new(&settings.folder_path), settings.retention_days).await?;
    Ok(backup_dir.to_string_lossy().to_string())
}

/// Opens `db_path` read-only and confirms it is a structurally sound AutoMono database:
/// `PRAGMA quick_check` passes and the core tables exist. Guards against restoring from a
/// truncated, half-written, or foreign file that a bare `is_file()` check would accept.
async fn validate_backup_db(db_path: &Path) -> Result<(), String> {
    const CORRUPT: &str = "La copia de seguridad está dañada o incompleta";
    if !db_path.is_file() {
        return Err("La carpeta seleccionada no contiene una copia de seguridad válida".into());
    }
    let url = format!("sqlite://{}?mode=ro", db_path.to_string_lossy());
    let pool = SqlitePool::connect(&url).await.map_err(|_| CORRUPT.to_string())?;

    let result = async {
        let check: String = sqlx::query_scalar("PRAGMA quick_check")
            .fetch_one(&pool)
            .await
            .map_err(|_| CORRUPT.to_string())?;
        if check != "ok" {
            return Err(CORRUPT.to_string());
        }
        for table in CORE_TABLES {
            let found: i64 = sqlx::query_scalar(
                "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = ?",
            )
            .bind(table)
            .fetch_one(&pool)
            .await
            .unwrap_or(0);
            if found == 0 {
                return Err(CORRUPT.to_string());
            }
        }
        Ok(())
    }
    .await;

    pool.close().await;
    result
}

fn dir_is_empty(path: &Path) -> bool {
    std::fs::read_dir(path)
        .map(|mut e| e.next().is_none())
        .unwrap_or(true)
}

fn dir_has_entries(path: &Path) -> bool {
    std::fs::read_dir(path)
        .map(|mut e| e.next().is_some())
        .unwrap_or(false)
}

/// Restores the DB and attachment trees from `backup_dir` into `data_dir` / `db_dest`.
///
/// The source is fully validated before anything on disk is touched; the attachment trees and
/// the DB are staged into `*.restoring` siblings, and the live copies are only swapped out once
/// every staged copy has succeeded. A failure part-way through therefore can't leave live data
/// half-deleted — the previous implementation `remove_dir_all`'d each live tree before copying
/// its replacement, so a bad backup wiped live data with nothing to show for it.
async fn restore_from_dir(backup_dir: &Path, data_dir: &Path, db_dest: &Path) -> Result<(), String> {
    let db_src = backup_dir.join(DB_FILE_NAME);
    validate_backup_db(&db_src).await?;

    // Integrity gate before any staging. A manifest (written since #53) checksums every
    // snapshotted file, so it catches partial copies and truncated files. Legacy backups with
    // no manifest fall back to the emptiness heuristic: reject a backup whose attachment folder
    // exists but is empty while the live one has files — the hallmark of an interrupted earlier
    // backup. Aborting beats wiping live receipts / contracts with nothing to replace them.
    if backup_dir.join(MANIFEST_FILE_NAME).is_file() {
        verify_manifest(backup_dir)?;
    } else {
        for sub in BACKUP_SUBDIRS {
            let src = backup_dir.join(sub);
            if src.exists() && dir_is_empty(&src) && dir_has_entries(&data_dir.join(sub)) {
                return Err(format!(
                    "La copia de seguridad parece incompleta (carpeta «{sub}» vacía); restauración cancelada"
                ));
            }
        }
    }

    // Stage every tree into a sibling temp dir first — non-destructive, a failure here leaves
    // live data untouched.
    let mut staged: Vec<(&str, PathBuf, PathBuf)> = Vec::new();
    for sub in BACKUP_SUBDIRS {
        let src = backup_dir.join(sub);
        if !src.exists() {
            continue;
        }
        let tmp = data_dir.join(format!("{sub}.restoring"));
        if tmp.exists() {
            std::fs::remove_dir_all(&tmp).map_err(|e| e.to_string())?;
        }
        copy_dir_recursive(&src, &tmp).map_err(|e| e.to_string())?;
        staged.push((sub, data_dir.join(sub), tmp));
    }

    // Stage the DB copy too, so the commit step below is renames only.
    let db_tmp = db_dest.with_file_name(format!("{DB_FILE_NAME}.restoring"));
    std::fs::copy(&db_src, &db_tmp).map_err(|e| e.to_string())?;

    // Commit. Past this point only renames and small removals run, so the failure window is
    // narrow.
    // ponytail: not one atomic transaction across all trees — acceptable for renames on a
    // single filesystem; a crash mid-loop leaves *.old / *.restoring dirs to clean up, not
    // lost data.
    for (_sub, dst, tmp) in &staged {
        let old = dst.with_file_name(format!(
            "{}.old",
            dst.file_name().unwrap_or_default().to_string_lossy()
        ));
        if old.exists() {
            std::fs::remove_dir_all(&old).map_err(|e| e.to_string())?;
        }
        if dst.exists() {
            std::fs::rename(dst, &old).map_err(|e| e.to_string())?;
        }
        std::fs::rename(tmp, dst).map_err(|e| e.to_string())?;
        std::fs::remove_dir_all(&old).ok();
    }

    // Drop stale WAL/SHM/journal sidecars so SQLite doesn't replay old frames against the
    // freshly-restored file, then swap the DB in with an atomic rename (never a torn write on
    // the live file).
    for suffix in ["-wal", "-shm", "-journal"] {
        let sidecar = db_dest.with_file_name(format!("{DB_FILE_NAME}{suffix}"));
        if sidecar.exists() {
            std::fs::remove_file(&sidecar).map_err(|e| e.to_string())?;
        }
    }
    std::fs::rename(&db_tmp, db_dest).map_err(|e| e.to_string())?;

    let context_src = backup_dir.join(CONTEXT_FILE_NAME);
    if context_src.is_file() {
        std::fs::copy(&context_src, data_dir.join(CONTEXT_FILE_NAME)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn restore_backup_cmd(app: AppHandle, backup_folder: String) -> Result<(), String> {
    let backup_dir = PathBuf::from(&backup_folder);

    // Validate before closing the live pool or touching disk, so a bad folder pick fails
    // cleanly with the app still fully usable.
    validate_backup_db(&backup_dir.join(DB_FILE_NAME)).await?;

    // The DB lives under `app_config_dir()` (that's where `tauri-plugin-sql` opens
    // `sqlite:automono.db`), while every attachment tree lives under `app_data_dir()`. On macOS —
    // the only supported target — those two resolve to the same folder; on other platforms they
    // diverge, so the split is deliberate, not a bug.
    let db_dest = app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join(DB_FILE_NAME);
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;

    // Close the live pool before touching the db file: overwriting an open sqlite file while a
    // connection holds it can corrupt data.
    if let Some(pool) = pool_from_app(&app).await {
        pool.close().await;
    }

    restore_from_dir(&backup_dir, &data_dir, &db_dest).await?;

    // The pool we just closed stays closed for this process — nothing in Rust reopens it, and a
    // webview reload would only paper over it via plugin-sql internals. Force a full relaunch so
    // the app comes back up cleanly against the restored DB.
    app.restart();
}

#[tauri::command]
pub async fn open_backup_folder_cmd(app: AppHandle, folder: String) -> Result<(), String> {
    app.opener().open_path(folder, None::<&str>).map_err(|e| e.to_string())
}

#[derive(Serialize)]
pub struct BackupEntry {
    pub folder_name: String,
    pub path: String,
}

#[tauri::command]
pub fn list_backups_cmd(folder: String) -> Result<Vec<BackupEntry>, String> {
    let dir = PathBuf::from(&folder);
    let mut entries: Vec<BackupEntry> = std::fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().to_string();
            if !name.starts_with("backup-") || !entry.path().join(DB_FILE_NAME).is_file() {
                return None;
            }
            Some(BackupEntry {
                folder_name: name,
                path: entry.path().to_string_lossy().to_string(),
            })
        })
        .collect();
    entries.sort_by(|a, b| b.folder_name.cmp(&a.folder_name));
    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn copy_dir_recursive_preserves_nested_structure() {
        let tmp = std::env::temp_dir().join(format!("automono_backup_test_{}", std::process::id()));
        let src = tmp.join("src");
        std::fs::create_dir_all(src.join("nested")).unwrap();
        std::fs::write(src.join("a.txt"), b"top").unwrap();
        std::fs::write(src.join("nested/b.txt"), b"deep").unwrap();

        let dst = tmp.join("dst");
        copy_dir_recursive(&src, &dst).expect("copy succeeds");

        assert_eq!(std::fs::read(dst.join("a.txt")).unwrap(), b"top");
        assert_eq!(std::fs::read(dst.join("nested/b.txt")).unwrap(), b"deep");
        std::fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn prune_old_backups_removes_only_folders_before_cutoff() {
        let tmp = std::env::temp_dir().join(format!("automono_prune_test_{}", std::process::id()));
        std::fs::create_dir_all(tmp.join("backup-2020-01-01T00-00-00")).unwrap();
        std::fs::create_dir_all(tmp.join("backup-2099-01-01T00-00-00")).unwrap();
        std::fs::create_dir_all(tmp.join("not-a-backup")).unwrap();

        prune_old_backups(&tmp, "2025-01-01T00-00-00").expect("prune succeeds");

        assert!(!tmp.join("backup-2020-01-01T00-00-00").exists());
        assert!(tmp.join("backup-2099-01-01T00-00-00").exists());
        assert!(tmp.join("not-a-backup").exists());
        std::fs::remove_dir_all(&tmp).ok();
    }

    #[tokio::test]
    async fn backup_db_produces_a_readable_consistent_copy() {
        let tmp = std::env::temp_dir().join(format!("automono_vacuum_test_{}", std::process::id()));
        std::fs::create_dir_all(&tmp).unwrap();
        let src_path = tmp.join("source.db");
        let dest_path = tmp.join("copy.db");

        let pool = sqlx::SqlitePool::connect(&format!("sqlite://{}?mode=rwc", src_path.display()))
            .await
            .unwrap();
        sqlx::query("CREATE TABLE t (v TEXT)").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO t (v) VALUES ('hello')").execute(&pool).await.unwrap();

        backup_db(&pool, &dest_path).await.expect("vacuum into succeeds");

        let check_pool = sqlx::SqlitePool::connect(&format!("sqlite://{}", dest_path.display()))
            .await
            .unwrap();
        let v: String = sqlx::query_scalar("SELECT v FROM t").fetch_one(&check_pool).await.unwrap();
        assert_eq!(v, "hello");

        std::fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn backup_is_due_respects_enabled_and_interval() {
        // disabled → never due, even with no prior backup
        assert!(!backup_is_due(false, None, "2025-01-01T00:00:00Z"));
        // enabled, never backed up → due
        assert!(backup_is_due(true, None, "2025-01-01T00:00:00Z"));
        // enabled, last backup older than the cutoff → due
        assert!(backup_is_due(
            true,
            Some("2024-01-01T00:00:00Z"),
            "2025-01-01T00:00:00Z"
        ));
        // enabled, last backup within the interval → not due
        assert!(!backup_is_due(
            true,
            Some("2025-06-01T00:00:00Z"),
            "2025-01-01T00:00:00Z"
        ));
    }

    async fn write_valid_db(path: &Path) {
        let pool = sqlx::SqlitePool::connect(&format!("sqlite://{}?mode=rwc", path.display()))
            .await
            .unwrap();
        sqlx::query("CREATE TABLE clients (id INTEGER PRIMARY KEY)")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("CREATE TABLE invoices (id INTEGER PRIMARY KEY)")
            .execute(&pool)
            .await
            .unwrap();
        pool.close().await;
    }

    fn restore_fixture(tag: &str) -> (PathBuf, PathBuf, PathBuf, PathBuf) {
        let tmp = std::env::temp_dir().join(format!(
            "automono_restore_{tag}_{}",
            std::process::id()
        ));
        std::fs::remove_dir_all(&tmp).ok();
        let backup = tmp.join("backup-2025-01-01T00-00-00");
        let data = tmp.join("data");
        let db_dest = tmp.join("config").join(DB_FILE_NAME);
        std::fs::create_dir_all(backup.join("expenses")).unwrap();
        std::fs::create_dir_all(data.join("expenses")).unwrap();
        std::fs::create_dir_all(db_dest.parent().unwrap()).unwrap();
        (tmp, backup, data, db_dest)
    }

    #[tokio::test]
    async fn restore_from_dir_rejects_a_corrupt_backup_db_without_touching_live_data() {
        let (tmp, backup, data, db_dest) = restore_fixture("corrupt");
        std::fs::write(backup.join(DB_FILE_NAME), b"not a sqlite database").unwrap();
        std::fs::write(data.join("expenses/receipt.pdf"), b"live receipt").unwrap();
        std::fs::write(&db_dest, b"live db").unwrap();

        let res = restore_from_dir(&backup, &data, &db_dest).await;

        assert!(res.is_err());
        assert_eq!(
            std::fs::read(data.join("expenses/receipt.pdf")).unwrap(),
            b"live receipt"
        );
        assert_eq!(std::fs::read(&db_dest).unwrap(), b"live db");
        std::fs::remove_dir_all(&tmp).ok();
    }

    #[tokio::test]
    async fn restore_from_dir_rejects_an_incomplete_backup_when_live_has_files() {
        let (tmp, backup, data, db_dest) = restore_fixture("incomplete");
        write_valid_db(&backup.join(DB_FILE_NAME)).await;
        // backup/expenses/ exists (from the fixture) but is empty; live has a receipt
        std::fs::write(data.join("expenses/receipt.pdf"), b"live receipt").unwrap();
        std::fs::write(&db_dest, b"live db").unwrap();

        let res = restore_from_dir(&backup, &data, &db_dest).await;

        assert!(res.is_err());
        assert_eq!(
            std::fs::read(data.join("expenses/receipt.pdf")).unwrap(),
            b"live receipt"
        );
        assert_eq!(std::fs::read(&db_dest).unwrap(), b"live db");
        std::fs::remove_dir_all(&tmp).ok();
    }

    #[tokio::test]
    async fn restore_from_dir_swaps_in_backup_data_on_a_valid_backup() {
        let (tmp, backup, data, db_dest) = restore_fixture("valid");
        write_valid_db(&backup.join(DB_FILE_NAME)).await;
        std::fs::write(backup.join("expenses/restored.pdf"), b"restored").unwrap();
        std::fs::write(data.join("expenses/stale.pdf"), b"stale").unwrap();
        std::fs::write(&db_dest, b"stale db").unwrap();

        restore_from_dir(&backup, &data, &db_dest)
            .await
            .expect("valid restore succeeds");

        assert!(data.join("expenses/restored.pdf").is_file());
        assert!(!data.join("expenses/stale.pdf").exists());
        assert_ne!(std::fs::read(&db_dest).unwrap(), b"stale db");
        std::fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn list_backups_cmd_filters_and_sorts() {
        let tmp = std::env::temp_dir().join(format!("automono_list_test_{}", std::process::id()));
        let valid_old = tmp.join("backup-2020-01-01T00-00-00");
        let valid_new = tmp.join("backup-2099-01-01T00-00-00");
        let invalid = tmp.join("backup-2050-01-01T00-00-00");
        std::fs::create_dir_all(&valid_old).unwrap();
        std::fs::write(valid_old.join(DB_FILE_NAME), b"db").unwrap();
        std::fs::create_dir_all(&valid_new).unwrap();
        std::fs::write(valid_new.join(DB_FILE_NAME), b"db").unwrap();
        std::fs::create_dir_all(&invalid).unwrap();
        std::fs::create_dir_all(tmp.join("not-a-backup")).unwrap();

        let entries = list_backups_cmd(tmp.to_string_lossy().to_string()).expect("list succeeds");

        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].folder_name, "backup-2099-01-01T00-00-00");
        assert_eq!(entries[1].folder_name, "backup-2020-01-01T00-00-00");

        std::fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn write_manifest_round_trips_and_verifies() {
        let tmp = std::env::temp_dir().join(format!("automono_manifest_test_{}", std::process::id()));
        std::fs::remove_dir_all(&tmp).ok();
        std::fs::create_dir_all(tmp.join("expenses/2025")).unwrap();
        std::fs::write(tmp.join(DB_FILE_NAME), b"fake db bytes").unwrap();
        std::fs::write(tmp.join("expenses/2025/receipt.pdf"), b"receipt body").unwrap();

        write_manifest(&tmp).expect("manifest written");

        let raw = std::fs::read(tmp.join(MANIFEST_FILE_NAME)).unwrap();
        let entries: Vec<ManifestEntry> = serde_json::from_slice(&raw).unwrap();
        // DB + one receipt; manifest.json itself is excluded.
        assert_eq!(entries.len(), 2);
        assert!(entries.iter().any(|e| e.path == "automono.db"));
        assert!(entries
            .iter()
            .any(|e| e.path == "expenses/2025/receipt.pdf" && e.size == 12));

        verify_manifest(&tmp).expect("verify passes on an untouched backup");
        std::fs::remove_dir_all(&tmp).ok();
    }

    #[tokio::test]
    async fn restore_from_dir_rejects_a_tampered_attachment_named_in_the_manifest() {
        let (tmp, backup, data, db_dest) = restore_fixture("tampered");
        write_valid_db(&backup.join(DB_FILE_NAME)).await;
        std::fs::write(backup.join("expenses/receipt.pdf"), b"original receipt").unwrap();
        write_manifest(&backup).expect("manifest written");
        // Truncate the attachment after the manifest recorded its size + checksum.
        std::fs::write(backup.join("expenses/receipt.pdf"), b"trunc").unwrap();

        std::fs::write(data.join("expenses/receipt.pdf"), b"live receipt").unwrap();
        std::fs::write(&db_dest, b"live db").unwrap();

        let err = restore_from_dir(&backup, &data, &db_dest)
            .await
            .expect_err("restore aborts on a tampered file");
        assert!(err.contains("receipt.pdf"), "error names the bad file: {err}");
        assert_eq!(
            std::fs::read(data.join("expenses/receipt.pdf")).unwrap(),
            b"live receipt"
        );
        assert_eq!(std::fs::read(&db_dest).unwrap(), b"live db");
        std::fs::remove_dir_all(&tmp).ok();
    }

    #[tokio::test]
    async fn restore_from_dir_accepts_a_valid_manifested_backup() {
        let (tmp, backup, data, db_dest) = restore_fixture("manifested");
        write_valid_db(&backup.join(DB_FILE_NAME)).await;
        std::fs::write(backup.join("expenses/restored.pdf"), b"restored").unwrap();
        write_manifest(&backup).expect("manifest written");
        std::fs::write(data.join("expenses/stale.pdf"), b"stale").unwrap();
        std::fs::write(&db_dest, b"stale db").unwrap();

        restore_from_dir(&backup, &data, &db_dest)
            .await
            .expect("valid manifested restore succeeds");

        assert!(data.join("expenses/restored.pdf").is_file());
        assert!(!data.join("expenses/stale.pdf").exists());
        std::fs::remove_dir_all(&tmp).ok();
    }

    #[tokio::test]
    async fn restore_from_dir_restores_a_legacy_backup_without_a_manifest() {
        let (tmp, backup, data, db_dest) = restore_fixture("legacy");
        write_valid_db(&backup.join(DB_FILE_NAME)).await;
        std::fs::write(backup.join("expenses/restored.pdf"), b"restored").unwrap();
        std::fs::write(data.join("expenses/stale.pdf"), b"stale").unwrap();
        std::fs::write(&db_dest, b"stale db").unwrap();
        // No manifest.json — a snapshot from before #53.

        restore_from_dir(&backup, &data, &db_dest)
            .await
            .expect("legacy backup restores via the emptiness-heuristic path");

        assert!(data.join("expenses/restored.pdf").is_file());
        assert!(!data.join("expenses/stale.pdf").exists());
        std::fs::remove_dir_all(&tmp).ok();
    }
}

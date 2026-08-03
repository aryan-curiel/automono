use std::io;
use std::path::{Path, PathBuf};

use serde::Serialize;
use sqlx::{Row, SqlitePool};
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_sql::{DbInstances, DbPool};

const DB_NAME: &str = "sqlite:automono.db";
const DB_FILE_NAME: &str = "automono.db";
const BACKUP_SUBDIRS: [&str; 3] = ["contracts", "expenses", "invoices"];

struct BackupSettings {
    folder_path: String,
    retention_days: i64,
}

async fn pool_from_app(app: &AppHandle) -> Option<SqlitePool> {
    let instances = app.state::<DbInstances>();
    let guard = instances.0.read().await;
    match guard.get(DB_NAME) {
        Some(DbPool::Sqlite(pool)) => Some(pool.clone()),
        _ => None,
    }
}

async fn load_backup_settings(pool: &SqlitePool) -> Result<BackupSettings, sqlx::Error> {
    let row = sqlx::query("SELECT folder_path, retention_days FROM backup_settings WHERE id = 1")
        .fetch_one(pool)
        .await?;
    Ok(BackupSettings {
        folder_path: row.get("folder_path"),
        retention_days: row.get("retention_days"),
    })
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

/// Best-effort backup fired from `on_window_event`'s `CloseRequested`. Never blocks the window
/// from closing on failure — errors are logged, not propagated.
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
    if let Err(e) = run_backup(app, &pool, Path::new(&settings.folder_path), settings.retention_days).await
    {
        eprintln!("backup on close failed: {e}");
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

#[tauri::command]
pub async fn restore_backup_cmd(app: AppHandle, backup_folder: String) -> Result<(), String> {
    let backup_dir = PathBuf::from(&backup_folder);
    let db_src = backup_dir.join(DB_FILE_NAME);
    if !db_src.is_file() {
        return Err("La carpeta seleccionada no contiene una copia de seguridad válida".into());
    }

    // Close the live pool before touching the db file: overwriting an open sqlite file while a
    // connection holds it can corrupt data.
    if let Some(pool) = pool_from_app(&app).await {
        pool.close().await;
    }

    let db_dest = app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join(DB_FILE_NAME);
    std::fs::copy(&db_src, &db_dest).map_err(|e| e.to_string())?;

    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    for sub in BACKUP_SUBDIRS {
        let src = backup_dir.join(sub);
        if src.exists() {
            let dst = data_dir.join(sub);
            if dst.exists() {
                std::fs::remove_dir_all(&dst).map_err(|e| e.to_string())?;
            }
            copy_dir_recursive(&src, &dst).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
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
}

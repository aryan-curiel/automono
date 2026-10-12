//! One-time carry-over of user data from the app's previous identifier (`com.aryancuriel.automono`).
//!
//! The app identifier decides the macOS data folder (`~/Library/Application Support/<identifier>`),
//! so renaming it would otherwise start the app on an empty database. On first launch under the new
//! identifier we copy the old folder across and rewrite the absolute file paths stored in the DB.
//! The old folder is never modified or deleted — it stays as a fallback until the user removes it.

use std::path::{Path, PathBuf};

use sqlx::sqlite::SqliteConnectOptions;
use sqlx::{Connection, SqliteConnection};

use crate::backup::{collect_files_relative, copy_dir_recursive};

pub const LEGACY_IDENTIFIER: &str = "com.aryancuriel.automono";
const DB_FILE_NAME: &str = "automono.db";

/// The legacy data folder that sits next to `data_dir` (both live in `Application Support`).
pub fn legacy_dir_beside(data_dir: &Path) -> PathBuf {
    data_dir.with_file_name(LEGACY_IDENTIFIER)
}

/// Runs the migration for `identifier`, before Tauri (and so the SQL plugin) starts. Returns
/// whether anything was migrated. ponytail: resolves `Application Support` from `$HOME` because no
/// `AppHandle` exists yet — fine while macOS is the only target.
pub fn migrate_for_identifier(identifier: &str) -> Result<bool, String> {
    let home = std::env::var_os("HOME").ok_or("HOME is not set")?;
    let new_dir = PathBuf::from(home).join("Library/Application Support").join(identifier);
    tauri::async_runtime::block_on(migrate(&legacy_dir_beside(&new_dir), &new_dir))
}

/// Copies `old_dir` to `new_dir` if the old folder has a database and the new one doesn't yet.
/// Works on a staging copy and only renames it into place once the copy is verified and the paths
/// are rewritten, so an interruption never leaves a half-migrated `new_dir` behind.
pub async fn migrate(old_dir: &Path, new_dir: &Path) -> Result<bool, String> {
    if old_dir == new_dir
        || !old_dir.join(DB_FILE_NAME).is_file()
        || new_dir.join(DB_FILE_NAME).exists()
    {
        return Ok(false);
    }

    let name = new_dir
        .file_name()
        .ok_or("invalid data folder")?
        .to_string_lossy()
        .to_string();
    let staging = new_dir.with_file_name(format!("{name}.migrating"));
    if staging.exists() {
        // Left over from an interrupted run. It's only ever a copy, so it's safe to discard.
        std::fs::remove_dir_all(&staging).map_err(|e| e.to_string())?;
    }
    copy_dir_recursive(old_dir, &staging).map_err(|e| e.to_string())?;
    verify_copy(old_dir, &staging)?;
    rewrite_paths(&staging.join(DB_FILE_NAME), old_dir, new_dir).await?;

    if new_dir.exists() {
        // No database in it (checked above), but don't delete anything we didn't create.
        let secs = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let aside = new_dir.with_file_name(format!("{name}.pre-migration-{secs}"));
        std::fs::rename(new_dir, aside).map_err(|e| e.to_string())?;
    }
    std::fs::rename(&staging, new_dir).map_err(|e| e.to_string())?;
    Ok(true)
}

/// Every file in `src` exists in `dst` with the same size.
fn verify_copy(src: &Path, dst: &Path) -> Result<(), String> {
    let mut files = Vec::new();
    collect_files_relative(src, src, &mut files).map_err(|e| e.to_string())?;
    for rel in files {
        let a = std::fs::metadata(src.join(&rel)).map_err(|e| e.to_string())?.len();
        let b = std::fs::metadata(dst.join(&rel))
            .map_err(|e| format!("{}: {e}", rel.display()))?
            .len();
        if a != b {
            return Err(format!("{}: copied size mismatch", rel.display()));
        }
    }
    Ok(())
}

/// Rewrites every TEXT value in `db` that starts with `old_dir/` to start with `new_dir/` instead.
/// Scans all tables and columns rather than a fixed list, so a path column added later can't be
/// missed. Also used after restoring a backup taken under the old identifier. A no-op when nothing
/// matches.
pub async fn rewrite_paths(db: &Path, old_dir: &Path, new_dir: &Path) -> Result<(), String> {
    let old = format!("{}/", old_dir.display());
    let new = format!("{}/", new_dir.display());
    let mut conn = SqliteConnection::connect_with(&SqliteConnectOptions::new().filename(db))
        .await
        .map_err(|e| e.to_string())?;

    let result = async {
        let mut tx = conn.begin().await.map_err(|e| e.to_string())?;
        let tables: Vec<String> = sqlx::query_scalar(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
        )
        .fetch_all(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        for table in tables {
            let columns: Vec<String> = sqlx::query_scalar(
                "SELECT name FROM pragma_table_info(?) WHERE upper(type) LIKE '%TEXT%'",
            )
            .bind(&table)
            .fetch_all(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
            for column in columns {
                // Only rows that actually hold a legacy path are touched, so lock triggers on
                // issued invoices / their lines never fire for unrelated rows.
                let sql = format!(
                    "UPDATE \"{table}\" SET \"{column}\" = ?1 || substr(\"{column}\", length(?2) + 1) \
                     WHERE substr(\"{column}\", 1, length(?2)) = ?2"
                );
                sqlx::query(&sql)
                    .bind(&new)
                    .bind(&old)
                    .execute(&mut *tx)
                    .await
                    .map_err(|e| format!("{table}.{column}: {e}"))?;
            }
        }
        tx.commit().await.map_err(|e| e.to_string())?;

        let check: String = sqlx::query_scalar("PRAGMA quick_check")
            .fetch_one(&mut conn)
            .await
            .map_err(|e| e.to_string())?;
        if check != "ok" {
            return Err(format!("database check failed: {check}"));
        }
        Ok(())
    }
    .await;

    conn.close().await.map_err(|e| e.to_string())?;
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn exec(db: &Path, sql: &str) {
        let opts = SqliteConnectOptions::new().filename(db).create_if_missing(true);
        let mut conn = SqliteConnection::connect_with(&opts).await.unwrap();
        sqlx::raw_sql(sql).execute(&mut conn).await.unwrap();
        conn.close().await.unwrap();
    }

    async fn paths(db: &Path) -> Vec<String> {
        let mut conn =
            SqliteConnection::connect_with(&SqliteConnectOptions::new().filename(db)).await.unwrap();
        let rows = sqlx::query_scalar("SELECT receipt_file_path FROM expenses ORDER BY id")
            .fetch_all(&mut conn)
            .await
            .unwrap();
        conn.close().await.unwrap();
        rows
    }

    #[tokio::test]
    async fn copies_data_rewrites_paths_and_leaves_the_old_folder_untouched() {
        let root = std::env::temp_dir()
            .join(format!("automono_legacy_test_{}", std::process::id()))
            .join("Application Support");
        let _ = std::fs::remove_dir_all(root.parent().unwrap());
        let old_dir = root.join(LEGACY_IDENTIFIER);
        let new_dir = root.join("com.example.automono");
        std::fs::create_dir_all(old_dir.join("expenses/2026/receipts")).unwrap();
        std::fs::write(old_dir.join("expenses/2026/receipts/a.pdf"), b"receipt").unwrap();

        let old_path = format!("{}/expenses/2026/receipts/a.pdf", old_dir.display());
        exec(
            &old_dir.join(DB_FILE_NAME),
            &format!(
                "CREATE TABLE expenses (id INTEGER PRIMARY KEY, receipt_file_path TEXT, note TEXT);
                 INSERT INTO expenses VALUES (1, '{old_path}', 'mentions {old_path} mid-text');
                 INSERT INTO expenses VALUES (2, '/elsewhere/b.pdf', NULL);"
            ),
        )
        .await;

        assert!(migrate(&old_dir, &new_dir).await.unwrap());

        assert_eq!(std::fs::read(new_dir.join("expenses/2026/receipts/a.pdf")).unwrap(), b"receipt");
        assert_eq!(
            paths(&new_dir.join(DB_FILE_NAME)).await,
            vec![
                format!("{}/expenses/2026/receipts/a.pdf", new_dir.display()),
                "/elsewhere/b.pdf".to_string(),
            ]
        );
        // The original is untouched, and a second launch is a no-op.
        assert_eq!(paths(&old_dir.join(DB_FILE_NAME)).await[0], old_path);
        assert!(!migrate(&old_dir, &new_dir).await.unwrap());
        assert!(!root.join("com.example.automono.migrating").exists());

        let _ = std::fs::remove_dir_all(root.parent().unwrap());
    }

    #[tokio::test]
    async fn does_nothing_without_a_legacy_database() {
        let root = std::env::temp_dir().join(format!("automono_legacy_none_{}", std::process::id()));
        let new_dir = root.join("com.example.automono");
        assert!(!migrate(&root.join(LEGACY_IDENTIFIER), &new_dir).await.unwrap());
        assert!(!new_dir.exists());
    }
}

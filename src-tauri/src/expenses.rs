use std::io;

use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

use crate::contracts::{copy_into, year_of};

fn attach_expense_file(app: &AppHandle, source_path: &str, date: &str, note: &str) -> io::Result<String> {
    let dest_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| io::Error::other(e.to_string()))?
        .join("expenses")
        .join(year_of(date))
        .join("receipts");
    let note = if note.trim().is_empty() { "gasto" } else { note.trim() };
    let dest_path = copy_into(std::path::Path::new(source_path), &dest_dir, &format!("{date}_{note}"))?;
    Ok(dest_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn attach_expense_file_cmd(
    app: AppHandle,
    source_path: String,
    date: String,
    note: String,
) -> Result<String, String> {
    attach_expense_file(&app, &source_path, &date, &note).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn open_expense_file_cmd(app: AppHandle, file_path: String) -> Result<(), String> {
    app.opener()
        .open_path(file_path, None::<&str>)
        .map_err(|e| e.to_string())
}

/// Removes the file(s) backing a deleted expense. Best-effort per path — a file that's already
/// missing (or fails to delete for some other reason) shouldn't block the user from finishing the
/// delete; the DB row is the source of truth, not the file.
#[tauri::command]
pub async fn delete_expense_files_cmd(paths: Vec<String>) -> Result<(), String> {
    for path in paths {
        std::fs::remove_file(&path).ok();
    }
    Ok(())
}

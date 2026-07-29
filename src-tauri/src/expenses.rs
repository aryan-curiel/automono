use std::io;

use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

use crate::contracts::copy_into;

fn attach_expense_file(app: &AppHandle, source_path: &str) -> io::Result<String> {
    let dest_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| io::Error::other(e.to_string()))?
        .join("expenses")
        .join("receipts");
    let dest_path = copy_into(std::path::Path::new(source_path), &dest_dir)?;
    Ok(dest_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn attach_expense_file_cmd(app: AppHandle, source_path: String) -> Result<String, String> {
    attach_expense_file(&app, &source_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn open_expense_file_cmd(app: AppHandle, file_path: String) -> Result<(), String> {
    app.opener()
        .open_path(file_path, None::<&str>)
        .map_err(|e| e.to_string())
}

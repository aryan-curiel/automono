use std::io;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

use crate::pdf::sanitize_filename;

/// Copies `source` into `dest_dir`, stamping the filename with the current
/// time so re-attaching a file with the same name never overwrites a
/// previously attached one.
pub(crate) fn copy_into(source: &Path, dest_dir: &Path) -> io::Result<PathBuf> {
    let file_name = source
        .file_name()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "source path has no file name"))?
        .to_string_lossy();
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let sanitized = sanitize_filename(&file_name);
    std::fs::create_dir_all(dest_dir)?;

    // Same-millisecond repeat attaches are possible (e.g. in a tight test loop or a
    // very fast double-click), so fall back to a counter suffix rather than silently
    // overwriting a previous attachment.
    let mut dest_path = dest_dir.join(format!("{millis}_{sanitized}"));
    let mut n = 1u32;
    while dest_path.exists() {
        dest_path = dest_dir.join(format!("{millis}_{n}_{sanitized}"));
        n += 1;
    }
    std::fs::copy(source, &dest_path)?;
    Ok(dest_path)
}

fn attach_contract_file(app: &AppHandle, client_id: i64, source_path: &str) -> io::Result<String> {
    let dest_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| io::Error::other(e.to_string()))?
        .join("contracts")
        .join(client_id.to_string());
    let dest_path = copy_into(Path::new(source_path), &dest_dir)?;
    Ok(dest_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn attach_contract_file_cmd(
    app: AppHandle,
    client_id: i64,
    source_path: String,
) -> Result<String, String> {
    attach_contract_file(&app, client_id, &source_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn open_contract_file_cmd(app: AppHandle, file_path: String) -> Result<(), String> {
    app.opener()
        .open_path(file_path, None::<&str>)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn copy_into_preserves_content() {
        let tmp = std::env::temp_dir().join(format!("automono_contracts_test_{}", std::process::id()));
        let source_dir = tmp.join("source");
        let dest_dir = tmp.join("dest");
        std::fs::create_dir_all(&source_dir).unwrap();

        let source_path = source_dir.join("contract.pdf");
        std::fs::write(&source_path, b"%PDF-fake-content").unwrap();

        let copied = copy_into(&source_path, &dest_dir).expect("copy succeeds");
        assert_eq!(std::fs::read(&copied).unwrap(), b"%PDF-fake-content");

        std::fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn copy_into_does_not_overwrite_on_repeat_attach() {
        let tmp = std::env::temp_dir().join(format!("automono_contracts_test_dup_{}", std::process::id()));
        let source_dir = tmp.join("source");
        let dest_dir = tmp.join("dest");
        std::fs::create_dir_all(&source_dir).unwrap();

        let source_path = source_dir.join("contract.pdf");
        std::fs::write(&source_path, b"v1").unwrap();
        let first = copy_into(&source_path, &dest_dir).expect("first copy succeeds");

        std::fs::write(&source_path, b"v2").unwrap();
        let second = copy_into(&source_path, &dest_dir).expect("second copy succeeds");

        assert_ne!(first, second, "each attach must produce a distinct file");
        assert_eq!(std::fs::read(&first).unwrap(), b"v1");
        assert_eq!(std::fs::read(&second).unwrap(), b"v2");

        std::fs::remove_dir_all(&tmp).ok();
    }
}

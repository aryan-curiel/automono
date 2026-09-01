use std::io;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

use crate::pdf::sanitize_filename;

/// The year prefix of an ISO date (`"2026-08-02"` -> `"2026"`), used to bucket attachments by
/// year so a whole tax year can be handed to a gestor as one folder. Falls back to "0000" for
/// a malformed/empty date (or one whose first 4 bytes aren't digits — e.g. `"../.."` — which
/// would otherwise turn into a `..` path segment) rather than failing the attach.
pub(crate) fn year_of(date: &str) -> &str {
    match date.get(0..4) {
        Some(prefix) if prefix.bytes().all(|b| b.is_ascii_digit()) => prefix,
        _ => "0000",
    }
}

/// Copies `source` into `dest_dir` as `base_name` (plus `source`'s extension), so the file
/// reads as `2026-08-02_acme-corp.pdf` in Finder instead of an internal timestamp. Falls back
/// to a counter suffix on a collision (e.g. two same-day attaches with the same base name)
/// rather than silently overwriting a previous attachment.
pub(crate) fn copy_into(source: &Path, dest_dir: &Path, base_name: &str) -> io::Result<PathBuf> {
    let ext = source.extension().and_then(|e| e.to_str()).unwrap_or("");
    let sanitized_base = sanitize_filename(base_name);
    std::fs::create_dir_all(dest_dir)?;

    let file_name = |suffix: &str| {
        if ext.is_empty() {
            format!("{sanitized_base}{suffix}")
        } else {
            format!("{sanitized_base}{suffix}.{ext}")
        }
    };
    let mut dest_path = dest_dir.join(file_name(""));
    let mut n = 1u32;
    let mut dest_file = loop {
        match std::fs::OpenOptions::new().write(true).create_new(true).open(&dest_path) {
            Ok(file) => break file,
            Err(e) if e.kind() == io::ErrorKind::AlreadyExists => {
                dest_path = dest_dir.join(file_name(&format!("_{n}")));
                n += 1;
            }
            Err(e) => return Err(e),
        }
    };
    io::copy(&mut std::fs::File::open(source)?, &mut dest_file)?;
    Ok(dest_path)
}

fn attach_contract_file(
    app: &AppHandle,
    client_id: i64,
    source_path: &str,
    start_date: &str,
) -> io::Result<String> {
    let dest_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| io::Error::other(e.to_string()))?
        .join("contracts")
        .join(year_of(start_date))
        .join(client_id.to_string());
    let stem = Path::new(source_path)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    let dest_path = copy_into(Path::new(source_path), &dest_dir, &format!("{start_date}_{stem}"))?;
    Ok(dest_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn attach_contract_file_cmd(
    app: AppHandle,
    client_id: i64,
    source_path: String,
    start_date: String,
) -> Result<String, String> {
    attach_contract_file(&app, client_id, &source_path, &start_date).map_err(|e| e.to_string())
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
    fn year_of_rejects_non_digit_prefixes() {
        assert_eq!(year_of("2026-08-02"), "2026");
        assert_eq!(year_of(""), "0000");
        assert_eq!(year_of("../../etc/passwd"), "0000");
        assert_eq!(year_of("ab"), "0000");
    }

    #[test]
    fn copy_into_preserves_content() {
        let tmp = std::env::temp_dir().join(format!("automono_contracts_test_{}", std::process::id()));
        let source_dir = tmp.join("source");
        let dest_dir = tmp.join("dest");
        std::fs::create_dir_all(&source_dir).unwrap();

        let source_path = source_dir.join("contract.pdf");
        std::fs::write(&source_path, b"%PDF-fake-content").unwrap();

        let copied = copy_into(&source_path, &dest_dir, "2026-08-02_acme-corp").expect("copy succeeds");
        assert_eq!(std::fs::read(&copied).unwrap(), b"%PDF-fake-content");

        std::fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn copy_into_names_the_file_from_base_name_and_source_extension() {
        let tmp = std::env::temp_dir().join(format!("automono_contracts_test_name_{}", std::process::id()));
        let source_dir = tmp.join("source");
        let dest_dir = tmp.join("dest");
        std::fs::create_dir_all(&source_dir).unwrap();

        let source_path = source_dir.join("original-name.pdf");
        std::fs::write(&source_path, b"content").unwrap();

        let copied = copy_into(&source_path, &dest_dir, "2026-08-02_acme-corp").expect("copy succeeds");
        assert_eq!(copied.file_name().unwrap().to_str().unwrap(), "2026-08-02_acme-corp.pdf");

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
        let first = copy_into(&source_path, &dest_dir, "2026-08-02_acme-corp").expect("first copy succeeds");

        std::fs::write(&source_path, b"v2").unwrap();
        let second = copy_into(&source_path, &dest_dir, "2026-08-02_acme-corp").expect("second copy succeeds");

        assert_ne!(first, second, "each attach must produce a distinct file");
        assert_eq!(std::fs::read(&first).unwrap(), b"v1");
        assert_eq!(std::fs::read(&second).unwrap(), b"v2");

        std::fs::remove_dir_all(&tmp).ok();
    }
}

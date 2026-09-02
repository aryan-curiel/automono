use std::io;
use std::path::Path;
use std::time::{Duration, SystemTime};

use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::contracts::{copy_into, year_of};
use crate::receipt_extract::extract_receipt_fields;

const RECEIPT_EXTENSIONS: [&str; 4] = ["pdf", "png", "jpg", "jpeg"];

/// A file that just landed in (or was picked for) the inbox: copied into the per-year receipts
/// folder and run through the field extractor, but not yet a real expense. The frontend inserts
/// one `receipt_inbox` row per entry, then the user confirms or discards it.
#[derive(Serialize)]
pub struct IngestedReceipt {
    pub receipt_file_path: String,
    pub source_name: String,
    pub date: Option<String>,
    pub amount: Option<f64>,
    pub iva_amount: Option<f64>,
    pub irpf_rate: Option<f64>,
    pub irpf_amount: Option<f64>,
    pub vendor: Option<String>,
}

fn is_receipt_file(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
        return false;
    };
    if name.starts_with('.') {
        return false; // .DS_Store and other dotfiles
    }
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| RECEIPT_EXTENSIONS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

/// True if the file was written very recently — a receipt still being copied into the folder by
/// Finder/rsync would otherwise get ingested half-written. A file older than the grace window is
/// assumed complete.
fn written_recently(path: &Path) -> bool {
    let Ok(modified) = std::fs::metadata(path).and_then(|m| m.modified()) else {
        return false;
    };
    SystemTime::now()
        .duration_since(modified)
        .map(|elapsed| elapsed < Duration::from_secs(3))
        .unwrap_or(false)
}

/// Lists receipt files (pdf/png/jpg/jpeg, no dotfiles, not mid-copy) currently in `folder`.
/// The frontend decides which of these to actually ingest (dedupe against the existing queue —
/// see `src/lib/receiptInbox.ts`). A missing/unreadable folder returns an empty list, not an
/// error: the folder is user-configured and may have been moved or deleted since.
#[tauri::command]
pub async fn list_receipt_inbox_files_cmd(folder: String) -> Result<Vec<String>, String> {
    let Ok(entries) = std::fs::read_dir(&folder) else {
        return Ok(Vec::new());
    };
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() && is_receipt_file(&path) && !written_recently(&path) {
            out.push(path.to_string_lossy().to_string());
        }
    }
    Ok(out)
}

fn ingest_one(app: &AppHandle, source_path: &str, delete_source: bool, fallback_date: &str) -> io::Result<IngestedReceipt> {
    let source = Path::new(source_path);
    let source_name = source
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("recibo")
        .to_string();

    let fields = extract_receipt_fields(source);
    let date = fields.date.clone().unwrap_or_else(|| fallback_date.to_string());
    let note = fields.vendor_guess.clone().unwrap_or_default();
    let note = if note.trim().is_empty() { "gasto" } else { note.trim() };

    let dest_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| io::Error::other(e.to_string()))?
        .join("expenses")
        .join(year_of(&date))
        .join("receipts");
    let stored = copy_into(source, &dest_dir, &format!("{date}_{note}"))?;

    // ponytail: an inbox is a tray you take mail out of — the file is now safely copied into
    // app_data (and covered by backups), so remove the original to keep the folder scan cheap
    // and idempotent. Only for the folder sweep, never for a file the user picked by hand.
    if delete_source {
        std::fs::remove_file(source).ok();
    }

    Ok(IngestedReceipt {
        receipt_file_path: stored.to_string_lossy().to_string(),
        source_name,
        date: fields.date,
        amount: fields.amount,
        iva_amount: fields.iva_amount,
        irpf_rate: fields.irpf_rate,
        irpf_amount: fields.irpf_amount,
        vendor: fields.vendor_guess,
    })
}

/// Copies one receipt into `expenses/<year>/receipts/`, extracts its fields, and (for the folder
/// sweep only) deletes the original. `fallback_date` is today's ISO date from the frontend, used
/// for the archive filename when the receipt has no readable date.
#[tauri::command]
pub async fn ingest_receipt_cmd(
    app: AppHandle,
    source_path: String,
    delete_source: bool,
    fallback_date: String,
) -> Result<IngestedReceipt, String> {
    ingest_one(&app, &source_path, delete_source, &fallback_date).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn is_receipt_file_accepts_supported_extensions_case_insensitively() {
        assert!(is_receipt_file(&PathBuf::from("/x/a.pdf")));
        assert!(is_receipt_file(&PathBuf::from("/x/a.PDF")));
        assert!(is_receipt_file(&PathBuf::from("/x/photo.JPG")));
        assert!(is_receipt_file(&PathBuf::from("/x/photo.jpeg")));
        assert!(!is_receipt_file(&PathBuf::from("/x/notes.txt")));
        assert!(!is_receipt_file(&PathBuf::from("/x/.DS_Store")));
        assert!(!is_receipt_file(&PathBuf::from("/x/noext")));
    }
}

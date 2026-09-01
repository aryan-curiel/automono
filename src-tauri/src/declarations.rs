use std::io::Write;

use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

use crate::contracts::{copy_into, ensure_under_data_dir};

fn attach_declaration_file(
    app: &AppHandle,
    year: i32,
    quarter: i32,
    modelo: &str,
    source_path: &str,
) -> std::io::Result<String> {
    let dest_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| std::io::Error::other(e.to_string()))?
        .join("declarations")
        .join(year.to_string());
    let base_name = format!("{year}-Q{quarter}_modelo{modelo}");
    let dest_path = copy_into(std::path::Path::new(source_path), &dest_dir, &base_name)?;
    Ok(dest_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn open_declaration_file_cmd(app: AppHandle, file_path: String) -> Result<(), String> {
    let file_path = ensure_under_data_dir(&app, &file_path)?;
    app.opener()
        .open_path(file_path.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn attach_declaration_file_cmd(
    app: AppHandle,
    year: i32,
    quarter: i32,
    modelo: String,
    source_path: String,
) -> Result<String, String> {
    attach_declaration_file(&app, year, quarter, &modelo, &source_path).map_err(|e| e.to_string())
}

/// Writes a file into the zip archive under `dir_name/`, using its own file name. Skips a path
/// that no longer exists on disk instead of failing the whole export, matching the folder-bundle
/// behavior in `export.rs`.
fn zip_named<W: Write + std::io::Seek>(
    zip: &mut zip::ZipWriter<W>,
    source: &str,
    dir_name: &str,
    options: zip::write::SimpleFileOptions,
) -> Result<(), String> {
    let source_path = std::path::Path::new(source);
    if !source_path.is_file() {
        return Ok(());
    }
    let file_name = source_path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("invalid source path")?;
    zip.start_file(format!("{dir_name}/{file_name}"), options)
        .map_err(|e| e.to_string())?;
    let contents = std::fs::read(source_path).map_err(|e| e.to_string())?;
    zip.write_all(&contents).map_err(|e| e.to_string())?;
    Ok(())
}

/// Builds the "download as zip" bundle for a declaration: invoice PDFs, expense receipts, and
/// the CSV summary, all sourced from the declaration's locked snapshot rather than live data.
#[tauri::command]
pub async fn export_declaration_zip_cmd(
    dest_path: String,
    invoice_pdf_paths: Vec<String>,
    expense_receipt_paths: Vec<String>,
    csv_contents: String,
) -> Result<String, String> {
    let file = std::fs::File::create(&dest_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let options =
        zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    for path in &invoice_pdf_paths {
        zip_named(&mut zip, path, "facturas", options)?;
    }
    for path in &expense_receipt_paths {
        zip_named(&mut zip, path, "gastos", options)?;
    }

    zip.start_file("resumen.csv", options).map_err(|e| e.to_string())?;
    zip.write_all(csv_contents.as_bytes()).map_err(|e| e.to_string())?;
    zip.finish().map_err(|e| e.to_string())?;

    Ok(dest_path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn zips_pdfs_receipts_and_csv_into_named_subfolders() {
        let tmp = std::env::temp_dir().join(format!("automono_declaration_zip_test_{}", std::process::id()));
        let sources = tmp.join("sources");
        std::fs::create_dir_all(&sources).unwrap();
        let pdf_path = sources.join("2026-Q3_AAA-1_acme-corp.pdf");
        std::fs::write(&pdf_path, b"%PDF-fake").unwrap();
        let receipt_path = sources.join("2026-08-02_rent.pdf");
        std::fs::write(&receipt_path, b"receipt").unwrap();

        let dest_zip = tmp.join("declaracion.zip");
        let result = export_declaration_zip_cmd(
            dest_zip.to_string_lossy().to_string(),
            vec![pdf_path.to_string_lossy().to_string()],
            vec![receipt_path.to_string_lossy().to_string()],
            "Facturas\n...".to_string(),
        )
        .await
        .expect("zip export succeeds");

        assert_eq!(result, dest_zip.to_string_lossy().to_string());

        let file = std::fs::File::open(&dest_zip).unwrap();
        let mut archive = zip::ZipArchive::new(file).unwrap();
        let names: Vec<String> = (0..archive.len())
            .map(|i| archive.by_index(i).unwrap().name().to_string())
            .collect();
        assert!(names.contains(&"facturas/2026-Q3_AAA-1_acme-corp.pdf".to_string()));
        assert!(names.contains(&"gastos/2026-08-02_rent.pdf".to_string()));
        assert!(names.contains(&"resumen.csv".to_string()));

        std::fs::remove_dir_all(&tmp).ok();
    }

    #[tokio::test]
    async fn zip_export_skips_a_missing_source_file_instead_of_failing() {
        let tmp = std::env::temp_dir().join(format!("automono_declaration_zip_missing_test_{}", std::process::id()));
        std::fs::create_dir_all(&tmp).unwrap();
        let dest_zip = tmp.join("declaracion.zip");

        let result = export_declaration_zip_cmd(
            dest_zip.to_string_lossy().to_string(),
            vec!["/nonexistent/path/invoice.pdf".to_string()],
            vec![],
            "csv".to_string(),
        )
        .await;

        assert!(result.is_ok());
        std::fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn attach_declaration_file_names_by_year_quarter_and_modelo() {
        let tmp = std::env::temp_dir().join(format!("automono_declaration_attach_test_{}", std::process::id()));
        let source_dir = tmp.join("source");
        std::fs::create_dir_all(&source_dir).unwrap();
        let source_path = source_dir.join("modelo.pdf");
        std::fs::write(&source_path, b"%PDF-fake").unwrap();

        let dest_dir = tmp.join("dest");
        let copied = crate::contracts::copy_into(&source_path, &dest_dir, "2026-Q3_modelo303")
            .expect("copy succeeds");
        assert_eq!(copied.file_name().unwrap().to_str().unwrap(), "2026-Q3_modelo303.pdf");

        std::fs::remove_dir_all(&tmp).ok();
    }
}

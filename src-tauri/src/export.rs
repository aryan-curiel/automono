#[tauri::command]
pub async fn write_text_file_cmd(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| e.to_string())
}

/// Reads a user-picked text file (bank-statement CSV for reconciliation, #36). The frontend
/// only gets a path back from the dialog plugin and there is no `plugin-fs`, so this thin
/// command does the read. Lossy UTF-8 so a Latin-1 bank export (common in Spain) still parses
/// rather than erroring.
#[tauri::command]
pub async fn read_text_file_cmd(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

/// Copies `source` into `dest_dir` under its own file name. Skips (rather than errors on) a
/// path that no longer exists on disk — an invoice/expense whose file was moved or deleted
/// shouldn't block the rest of the bundle.
fn copy_named(source: &str, dest_dir: &std::path::Path) -> Result<(), String> {
    let source_path = std::path::Path::new(source);
    if !source_path.is_file() {
        return Ok(());
    }
    let file_name = source_path.file_name().ok_or("invalid source path")?;
    std::fs::create_dir_all(dest_dir).map_err(|e| e.to_string())?;
    std::fs::copy(source_path, dest_dir.join(file_name)).map_err(|e| e.to_string())?;
    Ok(())
}

/// Builds a "hand this to your gestor" folder: invoice PDFs, expense receipts, and the CSV
/// summary already built on the frontend (`ResumenTrimestral`'s existing export logic), all in
/// one place instead of clicking through each record. Only invoices/expenses whose file was
/// already generated/attached are included — see the caller for that filter.
#[tauri::command]
pub async fn export_gestor_bundle_cmd(
    dest_folder: String,
    invoice_pdf_paths: Vec<String>,
    expense_receipt_paths: Vec<String>,
    csv_contents: String,
) -> Result<String, String> {
    let dest = std::path::Path::new(&dest_folder);
    let invoices_dir = dest.join("facturas");
    let expenses_dir = dest.join("gastos");

    for path in &invoice_pdf_paths {
        copy_named(path, &invoices_dir)?;
    }
    for path in &expense_receipt_paths {
        copy_named(path, &expenses_dir)?;
    }

    std::fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    std::fs::write(dest.join("resumen.csv"), csv_contents).map_err(|e| e.to_string())?;
    Ok(dest_folder)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn writes_contents_to_path() {
        let path = std::env::temp_dir()
            .join(format!("automono_export_test_{}.csv", std::process::id()))
            .to_string_lossy()
            .to_string();

        write_text_file_cmd(path.clone(), "a,b,c".to_string())
            .await
            .unwrap();

        assert_eq!(std::fs::read_to_string(&path).unwrap(), "a,b,c");
        std::fs::remove_file(&path).ok();
    }

    #[tokio::test]
    async fn bundles_pdfs_receipts_and_csv_into_named_subfolders() {
        let tmp = std::env::temp_dir().join(format!("automono_bundle_test_{}", std::process::id()));
        let sources = tmp.join("sources");
        std::fs::create_dir_all(&sources).unwrap();
        let pdf_path = sources.join("2026-Q3_AAA-1_acme-corp.pdf");
        std::fs::write(&pdf_path, b"%PDF-fake").unwrap();
        let receipt_path = sources.join("2026-08-02_rent.pdf");
        std::fs::write(&receipt_path, b"receipt").unwrap();

        let dest = tmp.join("dest");
        let result = export_gestor_bundle_cmd(
            dest.to_string_lossy().to_string(),
            vec![pdf_path.to_string_lossy().to_string()],
            vec![receipt_path.to_string_lossy().to_string()],
            "Facturas\n...".to_string(),
        )
        .await
        .expect("bundle succeeds");

        assert_eq!(result, dest.to_string_lossy().to_string());
        assert!(dest.join("facturas/2026-Q3_AAA-1_acme-corp.pdf").is_file());
        assert!(dest.join("gastos/2026-08-02_rent.pdf").is_file());
        assert_eq!(std::fs::read_to_string(dest.join("resumen.csv")).unwrap(), "Facturas\n...");

        std::fs::remove_dir_all(&tmp).ok();
    }

    #[tokio::test]
    async fn bundle_skips_a_missing_source_file_instead_of_failing() {
        let tmp = std::env::temp_dir().join(format!("automono_bundle_missing_test_{}", std::process::id()));
        let dest = tmp.join("dest");

        let result = export_gestor_bundle_cmd(
            dest.to_string_lossy().to_string(),
            vec!["/nonexistent/path/invoice.pdf".to_string()],
            vec![],
            "csv".to_string(),
        )
        .await;

        assert!(result.is_ok());
        assert!(!dest.join("facturas").exists());
        std::fs::remove_dir_all(&tmp).ok();
    }
}

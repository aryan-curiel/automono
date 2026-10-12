// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

mod assistant;
mod backup;
mod branding;
mod business_documents;
mod contract_extract;
mod contracts;
mod declarations;
mod expenses;
mod export;
mod invoicing;
mod keychain;
mod legacy_data;
mod llm;
mod modelo_review;
mod pdf;
mod receipt_extract;
mod receipt_inbox;
mod user_context;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// The full migration list, in order. Extracted from `run()` so a test can check it against
/// the actual `migrations/` directory — every `NNNN_*.sql` file must be registered here, or it
/// silently never runs against a real (non-test) database, since the frontend's own migration
/// test harness re-scans the directory independently and won't catch a registration gap here.
fn all_migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "scaffold_healthcheck",
            sql: include_str!("../migrations/0001_scaffold_healthcheck.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "clients",
            sql: include_str!("../migrations/0002_clients.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "vat_note_templates",
            sql: include_str!("../migrations/0003_vat_note_templates.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "invoices",
            sql: include_str!("../migrations/0004_invoices.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "invoice_lines",
            sql: include_str!("../migrations/0005_invoice_lines.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "contracts",
            sql: include_str!("../migrations/0006_contracts.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "expenses",
            sql: include_str!("../migrations/0007_expenses.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "invoice_lock",
            sql: include_str!("../migrations/0008_invoice_lock.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "client_vat_number",
            sql: include_str!("../migrations/0009_client_vat_number.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "business_profile",
            sql: include_str!("../migrations/0010_business_profile.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 11,
            description: "vat_note_art196",
            sql: include_str!("../migrations/0011_vat_note_art196.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 12,
            description: "client_country",
            sql: include_str!("../migrations/0012_client_country.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 13,
            description: "rectification_numbering",
            sql: include_str!("../migrations/0013_rectification_numbering.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 14,
            description: "backup_settings",
            sql: include_str!("../migrations/0014_backup_settings.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 15,
            description: "business_vat_number",
            sql: include_str!("../migrations/0015_business_vat_number.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 16,
            description: "invoice_series",
            sql: include_str!("../migrations/0016_invoice_series.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 17,
            description: "business_logo",
            sql: include_str!("../migrations/0017_business_logo.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 18,
            description: "preferences",
            sql: include_str!("../migrations/0018_preferences.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 19,
            description: "invoice_client_country_snapshot",
            sql: include_str!("../migrations/0019_invoice_client_country_snapshot.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 20,
            description: "expense_categories",
            sql: include_str!("../migrations/0020_expense_categories.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 21,
            description: "expense_irpf_retention",
            sql: include_str!("../migrations/0021_expense_irpf_retention.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 22,
            description: "expense_declared_period",
            sql: include_str!("../migrations/0022_expense_declared_period.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 23,
            description: "llm_settings",
            sql: include_str!("../migrations/0023_llm_settings.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 24,
            description: "llm_settings_providers",
            sql: include_str!("../migrations/0024_llm_settings_providers.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 25,
            description: "quarterly_declarations",
            sql: include_str!("../migrations/0025_quarterly_declarations.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 26,
            description: "reta_monthly_cuota",
            sql: include_str!("../migrations/0026_reta_monthly_cuota.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 27,
            description: "reta_start_date",
            sql: include_str!("../migrations/0027_reta_start_date.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 28,
            description: "expense_declared",
            sql: include_str!("../migrations/0028_expense_declared.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 29,
            description: "business_documents",
            sql: include_str!("../migrations/0029_business_documents.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 30,
            description: "business_documents_generic",
            sql: include_str!("../migrations/0030_business_documents_generic.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 31,
            description: "expense_iva_deductible_pct",
            sql: include_str!("../migrations/0031_expense_iva_deductible_pct.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 32,
            description: "declaration_gdj_rate",
            sql: include_str!("../migrations/0032_declaration_gdj_rate.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 33,
            description: "preferences_modelo_111",
            sql: include_str!("../migrations/0033_preferences_modelo_111.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 34,
            description: "llm_settings_provider_models",
            sql: include_str!("../migrations/0034_llm_settings_provider_models.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 35,
            description: "preferences_criterio_caja",
            sql: include_str!("../migrations/0035_preferences_criterio_caja.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 36,
            description: "expense_paid_date",
            sql: include_str!("../migrations/0036_expense_paid_date.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 37,
            description: "contract_billing_cadence",
            sql: include_str!("../migrations/0037_contract_billing_cadence.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 38,
            description: "expense_provider",
            sql: include_str!("../migrations/0038_expense_provider.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 39,
            description: "invoice_payment",
            sql: include_str!("../migrations/0039_invoice_payment.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 40,
            description: "bank_statement_lines",
            sql: include_str!("../migrations/0040_bank_statement_lines.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 41,
            description: "quotes",
            sql: include_str!("../migrations/0041_quotes.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 42,
            description: "receipt_inbox",
            sql: include_str!("../migrations/0042_receipt_inbox.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = all_migrations();
    let context = tauri::generate_context!();

    // Must run before the SQL plugin can open (and so create) an empty database in the new data
    // folder. On failure, refuse to start rather than launch empty: the old folder is untouched
    // and the next launch retries.
    match legacy_data::migrate_for_identifier(&context.config().identifier) {
        Ok(true) => eprintln!("Migrated data from {}", legacy_data::LEGACY_IDENTIFIER),
        Ok(false) => {}
        Err(e) => panic!("Could not migrate data from {}: {e}", legacy_data::LEGACY_IDENTIFIER),
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:automono.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            greet,
            invoicing::issue_invoice_cmd,
            invoicing::create_rectification_cmd,
            pdf::get_or_generate_invoice_pdf_cmd,
            pdf::get_or_generate_quote_pdf_cmd,
            contracts::attach_contract_file_cmd,
            contracts::open_contract_file_cmd,
            contract_extract::extract_contract_terms_cmd,
            expenses::attach_expense_file_cmd,
            expenses::open_expense_file_cmd,
            expenses::delete_expense_files_cmd,
            receipt_extract::extract_receipt_fields_cmd,
            receipt_extract::extract_receipt_fields_llm_cmd,
            receipt_inbox::list_receipt_inbox_files_cmd,
            receipt_inbox::ingest_receipt_cmd,
            branding::attach_business_logo_cmd,
            business_documents::attach_business_document_cmd,
            business_documents::extract_business_document_fields_cmd,
            business_documents::open_business_document_file_cmd,
            user_context::read_user_context_cmd,
            user_context::write_user_context_cmd,
            user_context::synthesize_user_context_cmd,
            assistant::ask_assistant_cmd,
            export::write_text_file_cmd,
            export::read_text_file_cmd,
            export::export_gestor_bundle_cmd,
            declarations::attach_declaration_file_cmd,
            declarations::open_declaration_file_cmd,
            declarations::export_declaration_zip_cmd,
            modelo_review::detect_modelo_cmd,
            modelo_review::extract_modelo_fields_cmd,
            keychain::get_llm_api_key_cmd,
            keychain::set_llm_api_key_cmd,
            keychain::clear_llm_api_key_cmd,
            backup::backup_now_cmd,
            backup::restore_backup_cmd,
            backup::list_backups_cmd,
            backup::open_backup_folder_cmd
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let app = window.app_handle().clone();
                tauri::async_runtime::block_on(backup::backup_on_close(&app));
            }
        })
        .run(context)
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Every `migrations/NNNN_*.sql` file must be registered in `all_migrations()`, in order —
    /// a file that exists on disk but isn't listed here silently never runs against a real
    /// database (unlike the frontend's migration test, which re-scans the directory itself and
    /// so can't catch a gap in this Rust-side registration).
    #[test]
    fn all_sql_files_are_registered_as_migrations() {
        let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/migrations");
        let mut files: Vec<String> = std::fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
            .filter(|name| name.ends_with(".sql"))
            .collect();
        files.sort();

        let migrations = all_migrations();
        assert_eq!(
            migrations.len(),
            files.len(),
            "expected {} migration(s) registered in all_migrations() to match {} .sql file(s) on disk: {:?}",
            migrations.len(),
            files.len(),
            files,
        );

        for (i, file) in files.iter().enumerate() {
            // Filenames must be a gap-free `0001..` run, and the leading `NNNN` must equal the
            // registered `version` — so a skipped or duplicated number (issue #15) fails loudly
            // instead of silently shifting every later migration's version by one.
            let file_number: i64 = file[..4]
                .parse()
                .unwrap_or_else(|_| panic!("migrations/{file} must start with a 4-digit number"));
            assert_eq!(
                file_number,
                (i + 1) as i64,
                "migrations/{file} breaks the sequential numbering (expected {:04})",
                i + 1,
            );
            assert_eq!(
                migrations[i].version, file_number,
                "migrations/{file} should be registered as version {file_number}",
            );
        }
    }
}

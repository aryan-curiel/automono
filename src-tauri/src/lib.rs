// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

mod backup;
mod contracts;
mod expenses;
mod export;
mod invoicing;
mod pdf;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
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
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
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
            contracts::attach_contract_file_cmd,
            contracts::open_contract_file_cmd,
            expenses::attach_expense_file_cmd,
            expenses::open_expense_file_cmd,
            export::write_text_file_cmd,
            backup::backup_now_cmd,
            backup::restore_backup_cmd,
            backup::list_backups_cmd
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let app = window.app_handle().clone();
                tauri::async_runtime::block_on(backup::backup_on_close(&app));
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

use serde::Serialize;
use sqlx::{Row, SqlitePool};
use tauri::Manager;
use tauri_plugin_sql::{DbInstances, DbPool};

const DB_NAME: &str = "sqlite:automono.db";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IssuedInvoice {
    pub id: i64,
    pub series_prefix: String,
    pub invoice_number: i64,
    pub status: String,
    pub issue_date: String,
    pub subtotal: f64,
    pub iva_rate: f64,
    pub iva_amount: f64,
    pub irpf_rate: Option<f64>,
    pub irpf_amount: Option<f64>,
    pub total: f64,
}

#[derive(Debug)]
pub enum IssueError {
    NotFound,
    AlreadyIssued,
    Db(sqlx::Error),
}

impl std::fmt::Display for IssueError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            IssueError::NotFound => write!(f, "invoice not found"),
            IssueError::AlreadyIssued => write!(f, "invoice has already been issued"),
            IssueError::Db(e) => write!(f, "database error: {e}"),
        }
    }
}

impl From<sqlx::Error> for IssueError {
    fn from(e: sqlx::Error) -> Self {
        IssueError::Db(e)
    }
}

/// Assigns series_prefix/invoice_number atomically and locks the invoice.
/// Runs entirely inside one sqlx transaction bound to a single connection,
/// which SQLite serializes at the file level - the `WHERE status = 'draft'`
/// guard on the final UPDATE is what makes concurrent issuance safe.
pub async fn issue_invoice(
    pool: &SqlitePool,
    invoice_id: i64,
    issue_date: &str,
) -> Result<IssuedInvoice, IssueError> {
    let mut tx = pool.begin().await?;

    let invoice = sqlx::query(
        "SELECT client_id, status, language, iva_rate, irpf_rate FROM invoices WHERE id = ?",
    )
    .bind(invoice_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(IssueError::NotFound)?;

    let status: String = invoice.get("status");
    if status != "draft" {
        return Err(IssueError::AlreadyIssued);
    }
    let client_id: i64 = invoice.get("client_id");
    let invoice_language: Option<String> = invoice.get("language");
    let mut irpf_rate: Option<f64> = invoice.get("irpf_rate");
    let mut iva_rate: f64 = invoice.get::<Option<f64>, _>("iva_rate").unwrap_or(0.0);

    let client = sqlx::query(
        "SELECT s.id AS series_id, s.prefix AS invoice_prefix, s.next_invoice_number,
                c.name, c.address, c.nif_cif, c.vat_number, c.vat_treatment, c.invoice_language, c.country
         FROM clients c JOIN invoice_series s ON s.id = c.series_id WHERE c.id = ?",
    )
    .bind(client_id)
    .fetch_one(&mut *tx)
    .await?;

    let series_id: i64 = client.get("series_id");
    let invoice_prefix: String = client.get("invoice_prefix");
    let next_number: i64 = client.get("next_invoice_number");
    let client_name: String = client.get("name");
    let client_address: Option<String> = client.get("address");
    let client_nif: String = client.get("nif_cif");
    let client_vat_number: Option<String> = client.get("vat_number");
    let vat_treatment: String = client.get("vat_treatment");
    let client_language: String = client.get("invoice_language");
    let client_country: Option<String> = client.get("country");
    let client_is_foreign = client_country.as_deref().is_some_and(|c| c != "ES");

    // VAT is all-or-nothing per invoice: non-standard treatments are always 0%,
    // regardless of whatever the draft had stored (the FE already enforces this,
    // this is the server-side backstop).
    if vat_treatment != "standard" {
        iva_rate = 0.0;
    }

    // IRPF withholding doesn't apply to foreign clients — 0%, not absent, so the
    // totals breakdown can still show the line with a "foreign client" note instead
    // of hiding it. Same server-side-backstop rationale as the VAT rate above.
    if client_is_foreign {
        irpf_rate = Some(0.0);
    }

    let language = invoice_language.unwrap_or(client_language);

    let mut vat_note_text: Option<String> = sqlx::query_scalar(
        "SELECT note_text FROM vat_note_templates WHERE treatment_code = ? AND language = ?",
    )
    .bind(&vat_treatment)
    .bind(&language)
    .fetch_optional(&mut *tx)
    .await?;
    if vat_note_text.is_none() {
        vat_note_text = sqlx::query_scalar(
            "SELECT note_text FROM vat_note_templates WHERE treatment_code = ? AND language = 'es'",
        )
        .bind(&vat_treatment)
        .fetch_optional(&mut *tx)
        .await?;
    }

    let lines = sqlx::query("SELECT quantity, unit_price FROM invoice_lines WHERE invoice_id = ?")
        .bind(invoice_id)
        .fetch_all(&mut *tx)
        .await?;
    let subtotal: f64 = lines
        .iter()
        .map(|r| {
            let quantity: f64 = r.get("quantity");
            let unit_price: f64 = r.get("unit_price");
            quantity * unit_price
        })
        .sum();

    let iva_amount = subtotal * iva_rate / 100.0;
    let irpf_amount = irpf_rate.map(|rate| subtotal * rate / 100.0);
    let total = subtotal + iva_amount - irpf_amount.unwrap_or(0.0);

    sqlx::query("UPDATE invoice_series SET next_invoice_number = next_invoice_number + 1 WHERE id = ?")
        .bind(series_id)
        .execute(&mut *tx)
        .await?;

    let result = sqlx::query(
        "UPDATE invoices SET
            series_prefix = ?, invoice_number = ?, status = 'issued', issue_date = ?,
            due_date = COALESCE(due_date, date(?, '+30 days')),
            vat_treatment = ?, vat_note_text = ?, language = ?,
            client_name_snapshot = ?, client_address_snapshot = ?, client_nif_snapshot = ?,
            client_vat_number_snapshot = ?, client_country_snapshot = ?,
            subtotal = ?, iva_rate = ?, iva_amount = ?, irpf_rate = ?, irpf_amount = ?, total = ?
         WHERE id = ? AND status = 'draft'",
    )
    .bind(&invoice_prefix)
    .bind(next_number)
    .bind(issue_date)
    .bind(issue_date)
    .bind(&vat_treatment)
    .bind(&vat_note_text)
    .bind(&language)
    .bind(&client_name)
    .bind(&client_address)
    .bind(&client_nif)
    .bind(&client_vat_number)
    .bind(&client_country)
    .bind(subtotal)
    .bind(iva_rate)
    .bind(iva_amount)
    .bind(irpf_rate)
    .bind(irpf_amount)
    .bind(total)
    .bind(invoice_id)
    .execute(&mut *tx)
    .await?;

    // Re-checks the draft guard right at the write: if another transaction won
    // the race and already flipped this invoice to issued, this affects 0 rows.
    if result.rows_affected() != 1 {
        return Err(IssueError::AlreadyIssued);
    }

    tx.commit().await?;

    Ok(IssuedInvoice {
        id: invoice_id,
        series_prefix: invoice_prefix,
        invoice_number: next_number,
        status: "issued".to_string(),
        issue_date: issue_date.to_string(),
        subtotal,
        iva_rate,
        iva_amount,
        irpf_rate,
        irpf_amount,
        total,
    })
}

#[tauri::command]
pub async fn issue_invoice_cmd(
    app: tauri::AppHandle,
    invoice_id: i64,
    issue_date: String,
) -> Result<IssuedInvoice, String> {
    let instances = app.state::<DbInstances>();
    let pool = {
        let guard = instances.0.read().await;
        let db = guard.get(DB_NAME).ok_or("database not loaded")?;
        match db {
            DbPool::Sqlite(pool) => pool.clone(),
        }
    };
    issue_invoice(&pool, invoice_id, &issue_date)
        .await
        .map_err(|e| e.to_string())
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewRectificationLine {
    pub description: String,
    pub quantity: f64,
    pub unit_price: f64,
}

#[derive(Debug)]
pub enum RectifyError {
    NotFound,
    NotIssued,
    AlreadyRectified,
    Db(sqlx::Error),
}

impl std::fmt::Display for RectifyError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RectifyError::NotFound => write!(f, "original invoice not found"),
            RectifyError::NotIssued => write!(f, "only issued invoices can be rectified"),
            RectifyError::AlreadyRectified => write!(f, "invoice has already been rectified"),
            RectifyError::Db(e) => write!(f, "database error: {e}"),
        }
    }
}

impl From<sqlx::Error> for RectifyError {
    fn from(e: sqlx::Error) -> Self {
        RectifyError::Db(e)
    }
}

/// Creates and issues a rectification invoice in one step (unlike regular invoices,
/// rectifications have no separate draft phase - their content is fully known upfront).
/// Assigns series_prefix/invoice_number from the client's separate
/// `next_rectification_number` counter, atomically, the same way `issue_invoice` assigns
/// from `next_invoice_number`: single transaction, SQLite's file-level serialization.
pub async fn create_rectification(
    pool: &SqlitePool,
    original_invoice_id: i64,
    rectification_type: &str,
    reason: &str,
    issue_date: &str,
    lines: Vec<NewRectificationLine>,
) -> Result<IssuedInvoice, RectifyError> {
    let mut tx = pool.begin().await?;

    let original = sqlx::query(
        "SELECT client_id, status, is_rectification, vat_treatment, vat_note_text, language,
                client_name_snapshot, client_address_snapshot, client_nif_snapshot,
                client_vat_number_snapshot, client_country_snapshot, iva_rate, irpf_rate
         FROM invoices WHERE id = ?",
    )
    .bind(original_invoice_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(RectifyError::NotFound)?;

    let status: String = original.get("status");
    let is_rectification: i64 = original.get("is_rectification");
    if !matches!(status.as_str(), "issued" | "paid") || is_rectification != 0 {
        return Err(RectifyError::NotIssued);
    }

    let already_rectified: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM invoices WHERE rectifies_invoice_id = ?",
    )
    .bind(original_invoice_id)
    .fetch_one(&mut *tx)
    .await?;
    if already_rectified > 0 {
        return Err(RectifyError::AlreadyRectified);
    }

    let client_id: i64 = original.get("client_id");
    let vat_treatment: String = original.get("vat_treatment");
    let vat_note_text: Option<String> = original.get("vat_note_text");
    let language: Option<String> = original.get("language");
    let client_name: Option<String> = original.get("client_name_snapshot");
    let client_address: Option<String> = original.get("client_address_snapshot");
    let client_nif: Option<String> = original.get("client_nif_snapshot");
    let client_vat_number: Option<String> = original.get("client_vat_number_snapshot");
    let client_country: Option<String> = original.get("client_country_snapshot");
    let iva_rate: f64 = original.get::<Option<f64>, _>("iva_rate").unwrap_or(0.0);
    let irpf_rate: Option<f64> = original.get("irpf_rate");

    let client = sqlx::query(
        "SELECT s.id AS series_id, s.prefix AS invoice_prefix, s.next_rectification_number
         FROM clients c JOIN invoice_series s ON s.id = c.series_id WHERE c.id = ?",
    )
    .bind(client_id)
    .fetch_one(&mut *tx)
    .await?;
    let series_id: i64 = client.get("series_id");
    let invoice_prefix: String = client.get("invoice_prefix");
    let next_number: i64 = client.get("next_rectification_number");

    let subtotal: f64 = lines.iter().map(|l| l.quantity * l.unit_price).sum();
    let iva_amount = subtotal * iva_rate / 100.0;
    let irpf_amount = irpf_rate.map(|rate| subtotal * rate / 100.0);
    let total = subtotal + iva_amount - irpf_amount.unwrap_or(0.0);

    sqlx::query(
        "UPDATE invoice_series SET next_rectification_number = next_rectification_number + 1 WHERE id = ?",
    )
    .bind(series_id)
    .execute(&mut *tx)
    .await?;

    // Inserted as a draft first: the invoice_lines lock triggers forbid adding lines to a row
    // that's already 'issued', so lines must go in before the row is flipped to issued below
    // (same ordering constraint `issue_invoice` relies on for regular invoices).
    let insert = sqlx::query(
        "INSERT INTO invoices (
            client_id, is_rectification, rectifies_invoice_id, rectification_reason, rectification_type
         ) VALUES (?, 1, ?, ?, ?)",
    )
    .bind(client_id)
    .bind(original_invoice_id)
    .bind(reason)
    .bind(rectification_type)
    .execute(&mut *tx)
    .await?;

    let new_id = insert.last_insert_rowid();

    for line in &lines {
        sqlx::query(
            "INSERT INTO invoice_lines (invoice_id, description, quantity, unit_price, total)
             VALUES (?, ?, ?, ?, ?)",
        )
        .bind(new_id)
        .bind(&line.description)
        .bind(line.quantity)
        .bind(line.unit_price)
        .bind(line.quantity * line.unit_price)
        .execute(&mut *tx)
        .await?;
    }

    sqlx::query(
        "UPDATE invoices SET
            series_prefix = ?, invoice_number = ?, status = 'issued', issue_date = ?,
            vat_treatment = ?, vat_note_text = ?, language = ?,
            client_name_snapshot = ?, client_address_snapshot = ?, client_nif_snapshot = ?,
            client_vat_number_snapshot = ?, client_country_snapshot = ?,
            subtotal = ?, iva_rate = ?, iva_amount = ?, irpf_rate = ?, irpf_amount = ?, total = ?
         WHERE id = ? AND status = 'draft'",
    )
    .bind(&invoice_prefix)
    .bind(next_number)
    .bind(issue_date)
    .bind(&vat_treatment)
    .bind(&vat_note_text)
    .bind(&language)
    .bind(&client_name)
    .bind(&client_address)
    .bind(&client_nif)
    .bind(&client_vat_number)
    .bind(&client_country)
    .bind(subtotal)
    .bind(iva_rate)
    .bind(iva_amount)
    .bind(irpf_rate)
    .bind(irpf_amount)
    .bind(total)
    .bind(new_id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(IssuedInvoice {
        id: new_id,
        series_prefix: invoice_prefix,
        invoice_number: next_number,
        status: "issued".to_string(),
        issue_date: issue_date.to_string(),
        subtotal,
        iva_rate,
        iva_amount,
        irpf_rate,
        irpf_amount,
        total,
    })
}

#[tauri::command]
pub async fn create_rectification_cmd(
    app: tauri::AppHandle,
    original_invoice_id: i64,
    rectification_type: String,
    reason: String,
    issue_date: String,
    lines: Vec<NewRectificationLine>,
) -> Result<IssuedInvoice, String> {
    let instances = app.state::<DbInstances>();
    let pool = {
        let guard = instances.0.read().await;
        let db = guard.get(DB_NAME).ok_or("database not loaded")?;
        match db {
            DbPool::Sqlite(pool) => pool.clone(),
        }
    };
    create_rectification(
        &pool,
        original_invoice_id,
        &rectification_type,
        &reason,
        &issue_date,
        lines,
    )
    .await
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn fresh_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("connect");
        for sql in [
            include_str!("../migrations/0002_clients.sql"),
            include_str!("../migrations/0003_vat_note_templates.sql"),
            include_str!("../migrations/0004_invoices.sql"),
            include_str!("../migrations/0005_invoice_lines.sql"),
            include_str!("../migrations/0008_invoice_lock.sql"),
            include_str!("../migrations/0009_client_vat_number.sql"),
            include_str!("../migrations/0012_client_country.sql"),
            include_str!("../migrations/0013_rectification_numbering.sql"),
            include_str!("../migrations/0016_invoice_series.sql"),
            include_str!("../migrations/0019_invoice_client_country_snapshot.sql"),
        ] {
            sqlx::raw_sql(sql).execute(&pool).await.expect("migrate");
        }
        pool
    }

    async fn seed_client(pool: &SqlitePool) -> i64 {
        sqlx::query("INSERT INTO invoice_series (prefix) VALUES ('ACM')")
            .execute(pool)
            .await
            .expect("insert series");
        sqlx::query(
            "INSERT INTO clients (name, nif_cif, vat_number, series_id, vat_treatment, invoice_language)
             VALUES ('Acme', '12345678Z', 'BG123456789', (SELECT id FROM invoice_series WHERE prefix = 'ACM'), 'standard', 'es')",
        )
        .execute(pool)
        .await
        .expect("insert client");
        sqlx::query_scalar(
            "SELECT c.id FROM clients c JOIN invoice_series s ON s.id = c.series_id WHERE s.prefix = 'ACM'",
        )
        .fetch_one(pool)
        .await
        .expect("get client id")
    }

    async fn seed_client_on_series(pool: &SqlitePool, series_id: i64, name: &str, nif: &str) -> i64 {
        sqlx::query(
            "INSERT INTO clients (name, nif_cif, series_id, vat_treatment, invoice_language)
             VALUES (?, ?, ?, 'standard', 'es')",
        )
        .bind(name)
        .bind(nif)
        .bind(series_id)
        .execute(pool)
        .await
        .expect("insert client");
        sqlx::query_scalar("SELECT last_insert_rowid()")
            .fetch_one(pool)
            .await
            .expect("last id")
    }

    async fn seed_draft_invoice(pool: &SqlitePool, client_id: i64) -> i64 {
        sqlx::query(
            "INSERT INTO invoices (client_id, status, iva_rate, irpf_rate) VALUES (?, 'draft', 21, 15)",
        )
        .bind(client_id)
        .execute(pool)
        .await
        .expect("insert invoice");
        let id: i64 = sqlx::query_scalar("SELECT last_insert_rowid()")
            .fetch_one(pool)
            .await
            .expect("last id");
        sqlx::query(
            "INSERT INTO invoice_lines (invoice_id, description, quantity, unit_price, total)
             VALUES (?, 'work', 1, 100, 100)",
        )
        .bind(id)
        .execute(pool)
        .await
        .expect("insert line");
        id
    }

    async fn seed_foreign_client(pool: &SqlitePool) -> i64 {
        sqlx::query("INSERT INTO invoice_series (prefix) VALUES ('FOR')")
            .execute(pool)
            .await
            .expect("insert series");
        sqlx::query(
            "INSERT INTO clients (name, nif_cif, series_id, vat_treatment, invoice_language, country)
             VALUES ('Foreign Co', 'US1234567', (SELECT id FROM invoice_series WHERE prefix = 'FOR'), 'export_outside_eu', 'en', 'US')",
        )
        .execute(pool)
        .await
        .expect("insert client");
        sqlx::query_scalar(
            "SELECT c.id FROM clients c JOIN invoice_series s ON s.id = c.series_id WHERE s.prefix = 'FOR'",
        )
        .fetch_one(pool)
        .await
        .expect("get client id")
    }

    async fn seed_draft_invoice_no_irpf(pool: &SqlitePool, client_id: i64) -> i64 {
        sqlx::query("INSERT INTO invoices (client_id, status, iva_rate) VALUES (?, 'draft', 0)")
            .bind(client_id)
            .execute(pool)
            .await
            .expect("insert invoice");
        let id: i64 = sqlx::query_scalar("SELECT last_insert_rowid()")
            .fetch_one(pool)
            .await
            .expect("last id");
        sqlx::query(
            "INSERT INTO invoice_lines (invoice_id, description, quantity, unit_price, total)
             VALUES (?, 'work', 1, 100, 100)",
        )
        .bind(id)
        .execute(pool)
        .await
        .expect("insert line");
        id
    }

    #[tokio::test]
    async fn numbering_never_collides_under_concurrent_issue() {
        let pool = fresh_pool().await;
        let client_id = seed_client(&pool).await;
        const N: usize = 10;
        let mut invoice_ids = Vec::new();
        for _ in 0..N {
            invoice_ids.push(seed_draft_invoice(&pool, client_id).await);
        }

        let handles: Vec<_> = invoice_ids
            .into_iter()
            .map(|id| {
                let pool = pool.clone();
                tokio::spawn(async move { issue_invoice(&pool, id, "2026-07-31").await })
            })
            .collect();

        let mut numbers: Vec<i64> = Vec::new();
        for handle in handles {
            let issued = handle.await.expect("task join").expect("issue succeeds");
            numbers.push(issued.invoice_number);
        }

        numbers.sort_unstable();
        assert_eq!(numbers, (1..=N as i64).collect::<Vec<_>>());

        let next_number: i64 = sqlx::query_scalar(
            "SELECT s.next_invoice_number FROM clients c JOIN invoice_series s ON s.id = c.series_id WHERE c.id = ?",
        )
        .bind(client_id)
        .fetch_one(&pool)
        .await
        .expect("read counter");
        assert_eq!(next_number, N as i64 + 1);
    }

    #[tokio::test]
    async fn two_clients_sharing_a_series_get_sequential_numbers() {
        let pool = fresh_pool().await;
        sqlx::query("INSERT INTO invoice_series (prefix) VALUES ('ACP')")
            .execute(&pool)
            .await
            .expect("insert series");
        let series_id: i64 = sqlx::query_scalar("SELECT id FROM invoice_series WHERE prefix = 'ACP'")
            .fetch_one(&pool)
            .await
            .expect("get series id");

        let client_a = seed_client_on_series(&pool, series_id, "Client A", "11111111A").await;
        let client_b = seed_client_on_series(&pool, series_id, "Client B", "22222222B").await;
        let invoice_a = seed_draft_invoice(&pool, client_a).await;
        let invoice_b = seed_draft_invoice(&pool, client_b).await;

        let issued_a = issue_invoice(&pool, invoice_a, "2026-07-31")
            .await
            .expect("issue a");
        let issued_b = issue_invoice(&pool, invoice_b, "2026-08-01")
            .await
            .expect("issue b");

        assert_eq!(issued_a.series_prefix, "ACP");
        assert_eq!(issued_b.series_prefix, "ACP");
        assert_eq!(issued_a.invoice_number, 1);
        assert_eq!(
            issued_b.invoice_number, 2,
            "second client on the shared series continues the same counter"
        );
    }

    #[tokio::test]
    async fn issued_invoice_is_immutable() {
        let pool = fresh_pool().await;
        let client_id = seed_client(&pool).await;
        let invoice_id = seed_draft_invoice(&pool, client_id).await;

        let issued = issue_invoice(&pool, invoice_id, "2026-07-31")
            .await
            .expect("first issue succeeds");
        assert_eq!(issued.invoice_number, 1);

        let vat_snapshot: Option<String> =
            sqlx::query_scalar("SELECT client_vat_number_snapshot FROM invoices WHERE id = ?")
                .bind(invoice_id)
                .fetch_one(&pool)
                .await
                .expect("read vat snapshot");
        assert_eq!(vat_snapshot.as_deref(), Some("BG123456789"));

        let second = issue_invoice(&pool, invoice_id, "2026-08-01").await;
        assert!(matches!(second, Err(IssueError::AlreadyIssued)));

        let unchanged: i64 = sqlx::query_scalar("SELECT invoice_number FROM invoices WHERE id = ?")
            .bind(invoice_id)
            .fetch_one(&pool)
            .await
            .expect("read number");
        assert_eq!(unchanged, 1);

        let blocked_update = sqlx::query("UPDATE invoices SET total = 999 WHERE id = ?")
            .bind(invoice_id)
            .execute(&pool)
            .await;
        assert!(blocked_update.is_err());

        let blocked_line_update =
            sqlx::query("UPDATE invoice_lines SET description = 'x' WHERE invoice_id = ?")
                .bind(invoice_id)
                .execute(&pool)
                .await;
        assert!(blocked_line_update.is_err());

        let blocked_line_insert = sqlx::query(
            "INSERT INTO invoice_lines (invoice_id, description, quantity, unit_price, total)
             VALUES (?, 'extra', 1, 1, 1)",
        )
        .bind(invoice_id)
        .execute(&pool)
        .await;
        assert!(blocked_line_insert.is_err());

        let blocked_line_delete = sqlx::query("DELETE FROM invoice_lines WHERE invoice_id = ?")
            .bind(invoice_id)
            .execute(&pool)
            .await;
        assert!(blocked_line_delete.is_err());
    }

    #[tokio::test]
    async fn issuing_defaults_due_date_to_30_days_after_issue_date() {
        let pool = fresh_pool().await;
        let client_id = seed_client(&pool).await;
        let invoice_id = seed_draft_invoice(&pool, client_id).await;

        issue_invoice(&pool, invoice_id, "2026-07-31")
            .await
            .expect("issue succeeds");

        let due_date: Option<String> = sqlx::query_scalar("SELECT due_date FROM invoices WHERE id = ?")
            .bind(invoice_id)
            .fetch_one(&pool)
            .await
            .expect("read due_date");
        assert_eq!(due_date.as_deref(), Some("2026-08-30"));
    }

    #[tokio::test]
    async fn irpf_not_applicable_is_not_deducted() {
        let pool = fresh_pool().await;
        let client_id = seed_client(&pool).await;
        let invoice_id = seed_draft_invoice_no_irpf(&pool, client_id).await;

        let issued = issue_invoice(&pool, invoice_id, "2026-07-31")
            .await
            .expect("issue succeeds");

        assert_eq!(issued.irpf_rate, None);
        assert_eq!(issued.irpf_amount, None);
        assert_eq!(issued.total, issued.subtotal + issued.iva_amount);

        let stored_rate: Option<f64> =
            sqlx::query_scalar("SELECT irpf_rate FROM invoices WHERE id = ?")
                .bind(invoice_id)
                .fetch_one(&pool)
                .await
                .expect("read irpf_rate");
        assert_eq!(stored_rate, None);
    }

    #[tokio::test]
    async fn issuing_forces_zero_irpf_and_snapshots_country_for_a_foreign_client() {
        let pool = fresh_pool().await;
        let client_id = seed_foreign_client(&pool).await;
        let invoice_id = seed_draft_invoice_no_irpf(&pool, client_id).await;

        let issued = issue_invoice(&pool, invoice_id, "2026-07-31")
            .await
            .expect("issue succeeds");

        assert_eq!(issued.irpf_rate, Some(0.0));
        assert_eq!(issued.irpf_amount, Some(0.0));

        let country: Option<String> =
            sqlx::query_scalar("SELECT client_country_snapshot FROM invoices WHERE id = ?")
                .bind(invoice_id)
                .fetch_one(&pool)
                .await
                .expect("read client_country_snapshot");
        assert_eq!(country.as_deref(), Some("US"));
    }

    #[tokio::test]
    async fn full_rectification_numbers_independently_and_negates_lines() {
        let pool = fresh_pool().await;
        let client_id = seed_client(&pool).await;
        let invoice_id = seed_draft_invoice(&pool, client_id).await;
        let issued = issue_invoice(&pool, invoice_id, "2026-07-31")
            .await
            .expect("issue succeeds");
        assert_eq!(issued.invoice_number, 1);

        let rectification = create_rectification(
            &pool,
            invoice_id,
            "full",
            "cliente canceló el servicio",
            "2026-08-01",
            vec![NewRectificationLine {
                description: "work".to_string(),
                quantity: 1.0,
                unit_price: -100.0,
            }],
        )
        .await
        .expect("rectification succeeds");

        // Same client, same numeric sequence position (1) as the original -
        // only possible because is_rectification is part of the UNIQUE key.
        assert_eq!(rectification.series_prefix, issued.series_prefix);
        assert_eq!(rectification.invoice_number, 1);
        assert_eq!(rectification.subtotal, -100.0);
        assert_eq!(rectification.total, -issued.total);

        let next_rect_number: i64 = sqlx::query_scalar(
            "SELECT s.next_rectification_number FROM clients c JOIN invoice_series s ON s.id = c.series_id WHERE c.id = ?",
        )
        .bind(client_id)
        .fetch_one(&pool)
        .await
        .expect("read counter");
        assert_eq!(next_rect_number, 2);

        let next_invoice_number: i64 = sqlx::query_scalar(
            "SELECT s.next_invoice_number FROM clients c JOIN invoice_series s ON s.id = c.series_id WHERE c.id = ?",
        )
        .bind(client_id)
        .fetch_one(&pool)
        .await
        .expect("read counter");
        assert_eq!(next_invoice_number, 2, "rectifying must not consume the regular sequence");
    }

    #[tokio::test]
    async fn cannot_rectify_the_same_invoice_twice() {
        let pool = fresh_pool().await;
        let client_id = seed_client(&pool).await;
        let invoice_id = seed_draft_invoice(&pool, client_id).await;
        issue_invoice(&pool, invoice_id, "2026-07-31")
            .await
            .expect("issue succeeds");

        create_rectification(
            &pool,
            invoice_id,
            "full",
            "primer motivo",
            "2026-08-01",
            vec![NewRectificationLine {
                description: "work".to_string(),
                quantity: 1.0,
                unit_price: -100.0,
            }],
        )
        .await
        .expect("first rectification succeeds");

        let second = create_rectification(
            &pool,
            invoice_id,
            "full",
            "segundo motivo",
            "2026-08-02",
            vec![NewRectificationLine {
                description: "work".to_string(),
                quantity: 1.0,
                unit_price: -100.0,
            }],
        )
        .await;
        assert!(matches!(second, Err(RectifyError::AlreadyRectified)));
    }

    #[tokio::test]
    async fn cannot_rectify_a_draft_or_a_rectification() {
        let pool = fresh_pool().await;
        let client_id = seed_client(&pool).await;
        let draft_id = seed_draft_invoice(&pool, client_id).await;

        let draft_attempt =
            create_rectification(&pool, draft_id, "full", "motivo", "2026-08-01", vec![]).await;
        assert!(matches!(draft_attempt, Err(RectifyError::NotIssued)));

        let invoice_id = seed_draft_invoice(&pool, client_id).await;
        issue_invoice(&pool, invoice_id, "2026-07-31")
            .await
            .expect("issue succeeds");
        let rectification = create_rectification(
            &pool,
            invoice_id,
            "full",
            "motivo",
            "2026-08-01",
            vec![NewRectificationLine {
                description: "work".to_string(),
                quantity: 1.0,
                unit_price: -100.0,
            }],
        )
        .await
        .expect("rectification succeeds");

        let double_rectify_attempt = create_rectification(
            &pool,
            rectification.id,
            "full",
            "motivo",
            "2026-08-02",
            vec![],
        )
        .await;
        assert!(matches!(double_rectify_attempt, Err(RectifyError::NotIssued)));
    }
}

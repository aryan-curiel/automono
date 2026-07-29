use std::path::{Path, PathBuf};

use genpdf::elements::{Break, CellDecorator, LinearLayout, Paragraph, TableLayout};
use genpdf::error::Error as GenPdfError;
use genpdf::fonts::{FontData, FontFamily};
use genpdf::style::{Color, Style};
use genpdf::{
    render, Alignment, Context, Document, Element, Margins, Mm, Position, RenderResult,
    SimplePageDecorator, Size,
};
use sqlx::{Row, SqlitePool};
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_sql::{DbInstances, DbPool};

const DB_NAME: &str = "sqlite:automono.db";

const FONT_REGULAR: &[u8] = include_bytes!("../assets/fonts/DejaVuSans.ttf");
const FONT_BOLD: &[u8] = include_bytes!("../assets/fonts/DejaVuSans-Bold.ttf");

#[derive(Debug, Clone, Default)]
pub struct BusinessProfile {
    pub name: String,
    pub nif_cif: String,
    pub vat_number: String,
    pub address: String,
    pub bank_name: String,
    pub iban: String,
    pub bic: String,
}

#[derive(Debug, Clone)]
pub struct PdfInvoiceLine {
    pub description: String,
    pub quantity: f64,
    pub unit_price: f64,
    pub total: f64,
}

#[derive(Debug, Clone)]
pub struct PdfInvoiceData {
    pub series_prefix: Option<String>,
    pub invoice_number: Option<i64>,
    pub is_rectification: bool,
    pub issue_date: Option<String>,
    pub due_date: Option<String>,
    pub language: String,
    pub client_name: Option<String>,
    pub client_nif: Option<String>,
    pub client_vat_number: Option<String>,
    pub client_vat_treatment: String,
    pub client_address: Option<String>,
    pub subtotal: f64,
    pub iva_rate: f64,
    pub iva_amount: f64,
    pub irpf_rate: Option<f64>,
    pub irpf_amount: Option<f64>,
    pub total: f64,
    pub vat_note_text: Option<String>,
    pub rectifies_number_label: Option<String>,
    pub rectification_reason: Option<String>,
    pub lines: Vec<PdfInvoiceLine>,
}

/// Mirrors the frontend's `invoiceNumberLabel()` (src/lib/invoice.ts). Free function (rather
/// than only a method on `PdfInvoiceData`) so it can also format the *original* invoice's
/// label when building the rectification reference note, without needing a full
/// `PdfInvoiceData` for a row that's otherwise irrelevant to the PDF being rendered.
pub fn format_number_label(series_prefix: Option<&str>, invoice_number: Option<i64>, is_rectification: bool) -> String {
    match (series_prefix, invoice_number) {
        (Some(prefix), Some(n)) => {
            let padded = format!("{n:03}");
            if is_rectification {
                format!("{prefix}-R{padded}")
            } else {
                format!("{prefix}-{padded}")
            }
        }
        _ => "Borrador".to_string(),
    }
}

impl PdfInvoiceData {
    pub fn number_label(&self) -> String {
        format_number_label(self.series_prefix.as_deref(), self.invoice_number, self.is_rectification)
    }
}

#[derive(Debug)]
pub enum PdfError {
    NotFound,
    NotIssued,
    Db(sqlx::Error),
    Io(std::io::Error),
    Render(String),
    Open(String),
}

impl std::fmt::Display for PdfError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PdfError::NotFound => write!(f, "invoice not found"),
            PdfError::NotIssued => write!(f, "PDF generation is only available for issued invoices"),
            PdfError::Db(e) => write!(f, "database error: {e}"),
            PdfError::Io(e) => write!(f, "filesystem error: {e}"),
            PdfError::Render(msg) => write!(f, "PDF rendering error: {msg}"),
            PdfError::Open(msg) => write!(f, "could not open PDF: {msg}"),
        }
    }
}

impl From<sqlx::Error> for PdfError {
    fn from(e: sqlx::Error) -> Self {
        PdfError::Db(e)
    }
}

impl From<std::io::Error> for PdfError {
    fn from(e: std::io::Error) -> Self {
        PdfError::Io(e)
    }
}

impl From<genpdf::error::Error> for PdfError {
    fn from(e: genpdf::error::Error) -> Self {
        PdfError::Render(e.to_string())
    }
}

struct Labels {
    invoice: &'static str,
    invoice_number: &'static str,
    issued_on: &'static str,
    due_date: &'static str,
    bill_to: &'static str,
    from: &'static str,
    tax_id: &'static str,
    vat_number: &'static str,
    items: &'static str,
    description: &'static str,
    quantity: &'static str,
    unit_price: &'static str,
    tax_rate: &'static str,
    line_total: &'static str,
    subtotal: &'static str,
    iva: &'static str,
    irpf: &'static str,
    total: &'static str,
    how_to_pay: &'static str,
    bank: &'static str,
    reference: &'static str,
    page_one_of_one: &'static str,
    rectification_tag: &'static str,
    rectifies: &'static str,
    reason: &'static str,
}

impl Labels {
    fn es() -> Labels {
        Labels {
            invoice: "Factura",
            invoice_number: "Número de factura",
            issued_on: "Emitida el",
            due_date: "Fecha de vencimiento",
            bill_to: "Facturar a",
            from: "De",
            tax_id: "NIF/CIF",
            vat_number: "Número de IVA",
            items: "Líneas",
            description: "Descripción",
            quantity: "Cant.",
            unit_price: "Precio",
            tax_rate: "Tipo de IVA",
            line_total: "Importe",
            subtotal: "Base imponible",
            iva: "IVA",
            irpf: "IRPF",
            total: "Total",
            how_to_pay: "Paga por transferencia bancaria",
            bank: "Banco",
            reference: "Referencia",
            page_one_of_one: "Página 1 de 1",
            rectification_tag: "Factura rectificativa",
            rectifies: "Rectifica a la factura",
            reason: "Motivo",
        }
    }

    fn en() -> Labels {
        Labels {
            invoice: "Invoice",
            invoice_number: "Invoice number",
            issued_on: "Issued on",
            due_date: "Due date",
            bill_to: "Billed to",
            from: "From",
            tax_id: "Tax ID",
            vat_number: "VAT number",
            items: "Items",
            description: "Description",
            quantity: "Qty",
            unit_price: "Price",
            tax_rate: "Tax rate",
            line_total: "Amount",
            subtotal: "Subtotal",
            iva: "VAT",
            irpf: "IRPF withholding",
            total: "Total",
            how_to_pay: "Pay by bank transfer",
            bank: "Bank",
            reference: "Reference",
            page_one_of_one: "Page 1 of 1",
            rectification_tag: "Rectification invoice",
            rectifies: "Rectifies invoice",
            reason: "Reason",
        }
    }

    fn for_language(language: &str) -> Labels {
        match language {
            "en" => Labels::en(),
            _ => Labels::es(),
        }
    }
}

fn format_eur(n: f64) -> String {
    let sign = if n < 0.0 { "-" } else { "" };
    let fixed = format!("{:.2}", n.abs());
    let (int_part, dec_part) = fixed.split_once('.').unwrap_or((fixed.as_str(), "00"));
    let mut grouped = String::new();
    for (i, c) in int_part.chars().rev().enumerate() {
        if i > 0 && i % 3 == 0 {
            grouped.push('.');
        }
        grouped.push(c);
    }
    let grouped: String = grouped.chars().rev().collect();
    format!("{sign}{grouped},{dec_part} €")
}

fn format_rate(rate: f64) -> String {
    if rate.fract() == 0.0 {
        format!("{rate:.0}")
    } else {
        format!("{rate}")
    }
}

/// Per-line "Tax rate" column, matching the invoice-wide IVA rate. Shown as "-" at 0% (e.g.
/// reverse-charge/exempt invoices), the same convention used when a line genuinely carries no tax.
fn tax_rate_display(rate: f64) -> String {
    if rate > 0.0 {
        format!("{}%", format_rate(rate))
    } else {
        "-".to_string()
    }
}

fn format_quantity(quantity: f64) -> String {
    if quantity.fract() == 0.0 {
        format!("{quantity:.0}")
    } else {
        format!("{quantity}")
    }
}

fn format_date(iso: Option<&str>) -> String {
    match iso {
        Some(iso) => match iso.split('-').collect::<Vec<_>>().as_slice() {
            [y, m, d] => format!("{d}/{m}/{y}"),
            _ => iso.to_string(),
        },
        None => "—".to_string(),
    }
}

/// The lines rendered under "Bill to". Pure and unit-tested separately from PDF rendering:
/// each optional client field is included only when it is actually set, per the requirement
/// that e.g. a VAT number should appear on the invoice only when the client has one.
fn client_block_lines(data: &PdfInvoiceData, labels: &Labels) -> Vec<String> {
    let mut lines = Vec::new();
    if let Some(name) = data.client_name.as_deref().filter(|s| !s.is_empty()) {
        lines.push(name.to_string());
    }
    if data.client_vat_treatment == "standard" {
        if let Some(nif) = data.client_nif.as_deref().filter(|s| !s.is_empty()) {
            lines.push(format!("{}: {}", labels.tax_id, nif));
        }
    }
    if let Some(vat) = data.client_vat_number.as_deref().filter(|s| !s.is_empty()) {
        lines.push(format!("{}: {}", labels.vat_number, vat));
    }
    if let Some(address) = data.client_address.as_deref().filter(|s| !s.is_empty()) {
        lines.push(address.to_string());
    }
    lines
}

/// The subtotal/IVA/IRPF/total rows, in render order. Pure so the IVA/IRPF rate labels can be
/// unit-tested without generating an actual PDF.
fn totals_lines(data: &PdfInvoiceData, labels: &Labels) -> Vec<(String, String)> {
    let mut rows = vec![
        (labels.subtotal.to_string(), format_eur(data.subtotal)),
        (
            format!("{} ({}%)", labels.iva, format_rate(data.iva_rate)),
            format_eur(data.iva_amount),
        ),
    ];
    if let (Some(irpf_rate), Some(irpf_amount)) = (data.irpf_rate, data.irpf_amount) {
        rows.push((
            format!("{} ({}%)", labels.irpf, format_rate(irpf_rate)),
            format!("-{}", format_eur(irpf_amount)),
        ));
    }
    rows.push((labels.total.to_string(), format_eur(data.total)));
    rows
}

/// A full-width horizontal line with no height of its own. genpdf's `TableLayout` can only apply
/// one border style to an entire table, so plain section dividers (under the items header, under
/// the totals block) are drawn with this standalone element instead.
struct Rule {
    color: Color,
}

impl Rule {
    fn new(color: Color) -> Rule {
        Rule { color }
    }
}

impl Element for Rule {
    fn render(
        &mut self,
        _context: &Context,
        area: render::Area<'_>,
        mut style: Style,
    ) -> Result<RenderResult, GenPdfError> {
        style.set_color(self.color);
        let width = area.size().width;
        area.draw_line(vec![Position::default(), Position::new(width, 0)], style);
        Ok(RenderResult {
            size: Size::new(width, 0),
            has_more: false,
        })
    }
}

/// Draws a top border only above the first and last row of the totals table, giving the ruled
/// (not boxed) look of a receipt total instead of `FrameCellDecorator`, which would also draw
/// vertical lines between the label and value columns.
struct TotalsRule {
    color: Color,
    num_rows: usize,
}

impl CellDecorator for TotalsRule {
    fn decorate_cell(
        &mut self,
        column: usize,
        row: usize,
        _has_more: bool,
        area: render::Area<'_>,
        mut style: Style,
    ) {
        if column == 0 || (row != 0 && row + 1 != self.num_rows) {
            return;
        }
        style.set_color(self.color);
        let width = area.size().width;
        area.draw_line(vec![Position::default(), Position::new(width, 0)], style);
    }
}

/// A fixed-height background band with an inset inner element, used for the page footer's gray
/// panel. genpdf's `Area` exposes no rectangle-fill primitive (only `draw_line`), so the fill is
/// approximated by stacking hairline-width strokes closely enough to leave no visible gaps.
/// ponytail: swap for a real fill (or a genpdf patch) if this ever shows seams or gets slow -
/// for a single-page invoice footer, a few hundred stroked lines is negligible either way.
struct FooterBand<E: Element> {
    fill: Color,
    height: Mm,
    padding: Margins,
    inner: E,
}

impl<E: Element> Element for FooterBand<E> {
    fn render(
        &mut self,
        context: &Context,
        mut area: render::Area<'_>,
        style: Style,
    ) -> Result<RenderResult, GenPdfError> {
        let mut fill_style = Style::new();
        fill_style.set_color(self.fill);
        let width = area.size().width;
        let step = Mm::from(0.15);
        let mut y = Mm::from(0.0);
        while y < self.height {
            area.draw_line(vec![Position::new(0, y), Position::new(width, y)], fill_style);
            y = y + step;
        }
        area.add_margins(self.padding);
        let result = self.inner.render(context, area, style)?;
        Ok(RenderResult {
            size: Size::new(width, self.height),
            has_more: result.has_more,
        })
    }
}

fn build_font_family() -> Result<FontFamily<FontData>, PdfError> {
    let regular = FontData::new(FONT_REGULAR.to_vec(), None)?;
    let bold = FontData::new(FONT_BOLD.to_vec(), None)?;
    Ok(FontFamily {
        regular: regular.clone(),
        bold: bold.clone(),
        // Invoices never need real italics; reusing regular/bold for those slots avoids
        // bundling two more font files for a style that's never rendered.
        italic: regular,
        bold_italic: bold,
    })
}

pub(crate) fn sanitize_filename(s: &str) -> String {
    s.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' { c } else { '_' })
        .collect()
}

/// Builds the invoice PDF and writes it to `out_path`, in the language carried by `invoice`
/// (falling back to Spanish for anything other than "en") - this is the "at least two
/// templates" requirement: one layout driven by whichever `Labels` set matches.
pub fn generate_pdf(
    business: &BusinessProfile,
    invoice: &PdfInvoiceData,
    out_path: &Path,
) -> Result<(), PdfError> {
    let labels = Labels::for_language(&invoice.language);
    let font_family = build_font_family()?;
    let mut doc = Document::new(font_family);
    doc.set_title(format!("{} {}", labels.invoice, invoice.number_label()));
    doc.set_minimal_conformance();
    doc.set_line_spacing(1.25);
    doc.set_font_size(10);

    let mut decorator = SimplePageDecorator::new();
    decorator.set_margins(15);
    doc.set_page_decorator(decorator);

    let ink = Color::Rgb(28, 36, 48);
    let soft = Color::Rgb(91, 100, 114);

    // Header: business name masthead top-right, with an "Invoice number / Issued on / Due date"
    // metadata stack top-left - mirrors the reference's info-stack-plus-masthead layout, rather
    // than the single huge "Invoice N" title used previously.
    let mut header = TableLayout::new(vec![3, 2]);
    header
        .row()
        .element(Paragraph::new(""))
        .element(
            Paragraph::new(business.name.clone())
                .aligned(Alignment::Right)
                .styled(Style::new().bold().with_font_size(16)),
        )
        .push()?;
    doc.push(header);
    doc.push(Break::new(1.2));

    doc.push(Paragraph::new(format!("{}: {}", labels.invoice_number, invoice.number_label())));
    doc.push(Paragraph::new(format!(
        "{}: {}",
        labels.issued_on,
        format_date(invoice.issue_date.as_deref())
    )));
    if invoice.due_date.is_some() {
        doc.push(Paragraph::new(format!(
            "{}: {}",
            labels.due_date,
            format_date(invoice.due_date.as_deref())
        )));
    }
    doc.push(Break::new(1.5));

    if invoice.is_rectification {
        doc.push(
            Paragraph::new(labels.rectification_tag)
                .styled(Style::new().bold().with_font_size(10).with_color(soft)),
        );
        doc.push(Break::new(0.8));
    }

    // Two-column "Billed to" / "From" block, side by side via a borderless 2-column table -
    // genpdf's LinearLayout only stacks vertically, so a table is the only way to lay elements
    // out horizontally.
    let mut info = TableLayout::new(vec![1, 1]);
    {
        let mut left = LinearLayout::vertical();
        left.push(Paragraph::new(labels.bill_to).styled(Style::new().bold()));
        left.push(Break::new(0.3));
        for line in client_block_lines(invoice, &labels) {
            left.push(Paragraph::new(line));
        }

        let mut right = LinearLayout::vertical();
        right.push(Paragraph::new(labels.from).styled(Style::new().bold()));
        right.push(Break::new(0.3));
        right.push(Paragraph::new(business.name.clone()));
        if !business.nif_cif.is_empty() {
            right.push(Paragraph::new(format!("{}: {}", labels.tax_id, business.nif_cif)));
        }
        if !business.vat_number.is_empty() {
            right.push(Paragraph::new(format!("{}: {}", labels.vat_number, business.vat_number)));
        }
        if !business.address.is_empty() {
            right.push(Paragraph::new(business.address.clone()));
        }

        info.row().element(left).element(right).push()?;
    }
    doc.push(info);
    doc.push(Break::new(1.5));

    doc.push(Paragraph::new(labels.items).styled(Style::new().bold().with_font_size(11)));
    doc.push(Break::new(0.5));

    let column_weights = vec![4, 2, 1, 2, 2];
    let mut header_row = TableLayout::new(column_weights.clone());
    header_row
        .row()
        .element(Paragraph::new(labels.description).styled(Style::new().bold().with_font_size(9)))
        .element(Paragraph::new(labels.unit_price).styled(Style::new().bold().with_font_size(9)))
        .element(Paragraph::new(labels.quantity).styled(Style::new().bold().with_font_size(9)))
        .element(Paragraph::new(labels.tax_rate).styled(Style::new().bold().with_font_size(9)))
        .element(
            Paragraph::new(labels.line_total)
                .aligned(Alignment::Right)
                .styled(Style::new().bold().with_font_size(9)),
        )
        .push()?;
    doc.push(header_row);
    doc.push(Break::new(0.3));
    doc.push(Rule::new(ink));
    doc.push(Break::new(0.3));

    // Simplification: a single rule closes the table rather than one under every line, unlike
    // the reference; add per-row rules if a client asks for that level of fidelity.
    let mut body = TableLayout::new(column_weights);
    for line in &invoice.lines {
        body.row()
            .element(Paragraph::new(line.description.clone()).padded(1))
            .element(Paragraph::new(format_eur(line.unit_price)).padded(1))
            .element(Paragraph::new(format_quantity(line.quantity)).padded(1))
            .element(Paragraph::new(tax_rate_display(invoice.iva_rate)).padded(1))
            .element(
                Paragraph::new(format_eur(line.total))
                    .aligned(Alignment::Right)
                    .padded(1),
            )
            .push()?;
    }
    doc.push(body);
    doc.push(Rule::new(ink));
    doc.push(Break::new(1.5));

    let totals_rows = totals_lines(invoice, &labels);
    let mut totals = TableLayout::new(vec![3, 2, 2]);
    totals.set_cell_decorator(TotalsRule {
        color: ink,
        num_rows: totals_rows.len(),
    });
    for (label, value) in totals_rows {
        totals
            .row()
            .element(Paragraph::new(""))
            .element(Paragraph::new(label).aligned(Alignment::Right).padded(1))
            .element(Paragraph::new(value).aligned(Alignment::Right).padded(1))
            .push()?;
    }
    doc.push(totals);

    if let (Some(orig_label), Some(reason)) = (
        invoice.rectifies_number_label.as_deref().filter(|s| !s.is_empty()),
        invoice.rectification_reason.as_deref().filter(|s| !s.is_empty()),
    ) {
        doc.push(Break::new(1.0));
        doc.push(
            Paragraph::new(format!(
                "{}: {}. {}: {}",
                labels.rectifies, orig_label, labels.reason, reason
            ))
            .styled(Style::new().bold().with_font_size(9)),
        );
    }

    if let Some(note) = invoice.vat_note_text.as_deref().filter(|s| !s.is_empty()) {
        doc.push(Break::new(1.0));
        doc.push(Paragraph::new(note.to_string()).styled(Style::new().with_font_size(9)));
    }

    // Footer: a full-width gray band pinned near the bottom, holding the bank-transfer details
    // and page count - the reference's "Pay by bank transfer" panel, minus the online-pay/QR
    // column and Revolut branding, which don't apply to this business's actual payment flow.
    // "Page 1 of 1" is static rather than a real page counter - ponytail: upgrade to a genpdf
    // page-number decorator if invoices ever routinely spill past one page.
    doc.push(Break::new(3.0));

    let mut footer_content = LinearLayout::vertical();
    footer_content.push(Paragraph::new(labels.how_to_pay).styled(Style::new().bold().with_font_size(12)));
    footer_content.push(Break::new(0.8));

    let mut footer_rows = TableLayout::new(vec![1, 2]);
    footer_rows
        .row()
        .element(Paragraph::new(labels.reference))
        .element(Paragraph::new(invoice.number_label()))
        .push()?;
    if !business.bank_name.is_empty() {
        footer_rows
            .row()
            .element(Paragraph::new(labels.bank))
            .element(Paragraph::new(business.bank_name.clone()))
            .push()?;
    }
    if !business.iban.is_empty() {
        footer_rows
            .row()
            .element(Paragraph::new("IBAN"))
            .element(Paragraph::new(business.iban.clone()).styled(Style::new().bold()))
            .push()?;
    }
    if !business.bic.is_empty() {
        footer_rows
            .row()
            .element(Paragraph::new("BIC"))
            .element(Paragraph::new(business.bic.clone()))
            .push()?;
    }
    footer_content.push(footer_rows);
    footer_content.push(Break::new(2.5));
    footer_content.push(Paragraph::new(labels.page_one_of_one).styled(Style::new().with_font_size(9).with_color(soft)));

    doc.push(FooterBand {
        fill: Color::Rgb(241, 242, 244),
        height: Mm::from(48.0),
        padding: Margins::trbl(6, 8, 6, 8),
        inner: footer_content,
    });

    if let Some(parent) = out_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    doc.render_to_file(out_path)?;
    Ok(())
}

/// Loads an issued invoice, generates its PDF if one doesn't already exist on disk, stores the
/// path on the invoice row, and opens it. Idempotent: re-invoking for an invoice whose PDF file
/// is still present just reopens it instead of regenerating, unless `force` is set, in which case
/// the PDF is always rebuilt from the current invoice/business data and the old file overwritten.
pub async fn get_or_generate_invoice_pdf(
    pool: &SqlitePool,
    app: &AppHandle,
    invoice_id: i64,
    force: bool,
) -> Result<String, PdfError> {
    let invoice_row = sqlx::query(
        "SELECT status, series_prefix, invoice_number, is_rectification, issue_date, due_date,
                language, client_name_snapshot, client_address_snapshot, client_nif_snapshot,
                client_vat_number_snapshot, vat_treatment, subtotal, iva_rate, iva_amount, irpf_rate,
                irpf_amount, total, vat_note_text, pdf_path, rectifies_invoice_id,
                rectification_reason
         FROM invoices WHERE id = ?",
    )
    .bind(invoice_id)
    .fetch_optional(pool)
    .await?
    .ok_or(PdfError::NotFound)?;

    let status: String = invoice_row.get("status");
    if status == "draft" {
        return Err(PdfError::NotIssued);
    }

    let rectifies_invoice_id: Option<i64> = invoice_row.get("rectifies_invoice_id");
    let rectifies_number_label = match rectifies_invoice_id {
        Some(original_id) => sqlx::query("SELECT series_prefix, invoice_number FROM invoices WHERE id = ?")
            .bind(original_id)
            .fetch_optional(pool)
            .await?
            .map(|row| {
                let series_prefix: Option<String> = row.get("series_prefix");
                let invoice_number: Option<i64> = row.get("invoice_number");
                format_number_label(series_prefix.as_deref(), invoice_number, false)
            }),
        None => None,
    };

    let existing_path: Option<String> = invoice_row.get("pdf_path");
    if !force {
        if let Some(path) = &existing_path {
            if Path::new(path).exists() {
                app.opener()
                    .open_path(path.clone(), None::<&str>)
                    .map_err(|e| PdfError::Open(e.to_string()))?;
                return Ok(path.clone());
            }
        }
    }

    let lines = sqlx::query(
        "SELECT description, quantity, unit_price, total FROM invoice_lines
         WHERE invoice_id = ? ORDER BY id",
    )
    .bind(invoice_id)
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|r| PdfInvoiceLine {
        description: r.get("description"),
        quantity: r.get("quantity"),
        unit_price: r.get("unit_price"),
        total: r.get("total"),
    })
    .collect();

    let profile_row = sqlx::query(
        "SELECT name, nif_cif, vat_number, address, bank_name, iban, bic FROM business_profile WHERE id = 1",
    )
    .fetch_one(pool)
    .await?;
    let business = BusinessProfile {
        name: profile_row.get("name"),
        nif_cif: profile_row.get("nif_cif"),
        vat_number: profile_row.get("vat_number"),
        address: profile_row.get("address"),
        bank_name: profile_row.get("bank_name"),
        iban: profile_row.get("iban"),
        bic: profile_row.get("bic"),
    };

    let data = PdfInvoiceData {
        series_prefix: invoice_row.get("series_prefix"),
        invoice_number: invoice_row.get("invoice_number"),
        is_rectification: invoice_row.get::<i64, _>("is_rectification") != 0,
        issue_date: invoice_row.get("issue_date"),
        due_date: invoice_row.get("due_date"),
        language: invoice_row
            .get::<Option<String>, _>("language")
            .unwrap_or_else(|| "es".to_string()),
        client_name: invoice_row.get("client_name_snapshot"),
        client_nif: invoice_row.get("client_nif_snapshot"),
        client_vat_number: invoice_row.get("client_vat_number_snapshot"),
        client_vat_treatment: invoice_row
            .get::<Option<String>, _>("vat_treatment")
            .unwrap_or_else(|| "standard".to_string()),
        client_address: invoice_row.get("client_address_snapshot"),
        subtotal: invoice_row.get::<Option<f64>, _>("subtotal").unwrap_or(0.0),
        iva_rate: invoice_row.get::<Option<f64>, _>("iva_rate").unwrap_or(0.0),
        iva_amount: invoice_row.get::<Option<f64>, _>("iva_amount").unwrap_or(0.0),
        irpf_rate: invoice_row.get("irpf_rate"),
        irpf_amount: invoice_row.get("irpf_amount"),
        total: invoice_row.get::<Option<f64>, _>("total").unwrap_or(0.0),
        vat_note_text: invoice_row.get("vat_note_text"),
        rectifies_number_label,
        rectification_reason: invoice_row.get("rectification_reason"),
        lines,
    };

    let file_name = format!("{}.pdf", sanitize_filename(&data.number_label()));
    let out_dir: PathBuf = app
        .path()
        .app_data_dir()
        .map_err(|e| PdfError::Io(std::io::Error::other(e.to_string())))?
        .join("invoices");
    let out_path = out_dir.join(file_name);

    generate_pdf(&business, &data, &out_path)?;

    let path_str = out_path.to_string_lossy().to_string();
    sqlx::query("UPDATE invoices SET pdf_path = ? WHERE id = ?")
        .bind(&path_str)
        .bind(invoice_id)
        .execute(pool)
        .await?;

    app.opener()
        .open_path(path_str.clone(), None::<&str>)
        .map_err(|e| PdfError::Open(e.to_string()))?;

    Ok(path_str)
}

#[tauri::command]
pub async fn get_or_generate_invoice_pdf_cmd(
    app: tauri::AppHandle,
    invoice_id: i64,
    force: bool,
) -> Result<String, String> {
    let instances = app.state::<DbInstances>();
    let pool = {
        let guard = instances.0.read().await;
        let db = guard.get(DB_NAME).ok_or("database not loaded")?;
        match db {
            DbPool::Sqlite(pool) => pool.clone(),
        }
    };
    get_or_generate_invoice_pdf(&pool, &app, invoice_id, force)
        .await
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_invoice(vat_number: Option<&str>, vat_note: Option<&str>) -> PdfInvoiceData {
        sample_invoice_with_treatment(vat_number, vat_note, "standard")
    }

    fn sample_invoice_with_treatment(
        vat_number: Option<&str>,
        vat_note: Option<&str>,
        vat_treatment: &str,
    ) -> PdfInvoiceData {
        PdfInvoiceData {
            series_prefix: Some("ACM".to_string()),
            invoice_number: Some(7),
            is_rectification: false,
            issue_date: Some("2026-07-31".to_string()),
            due_date: Some("2026-08-30".to_string()),
            language: "es".to_string(),
            client_name: Some("Acme SL".to_string()),
            client_nif: Some("B12345678".to_string()),
            client_vat_number: vat_number.map(str::to_string),
            client_vat_treatment: vat_treatment.to_string(),
            client_address: Some("Calle Falsa 123".to_string()),
            subtotal: 100.0,
            iva_rate: 21.0,
            iva_amount: 21.0,
            irpf_rate: Some(15.0),
            irpf_amount: Some(15.0),
            total: 106.0,
            vat_note_text: vat_note.map(str::to_string),
            rectifies_number_label: None,
            rectification_reason: None,
            lines: vec![PdfInvoiceLine {
                description: "Consultoría".to_string(),
                quantity: 1.0,
                unit_price: 100.0,
                total: 100.0,
            }],
        }
    }

    #[test]
    fn number_label_formats_regular_and_rectification() {
        let mut data = sample_invoice(None, None);
        assert_eq!(data.number_label(), "ACM-007");
        data.is_rectification = true;
        assert_eq!(data.number_label(), "ACM-R007");
        data.series_prefix = None;
        assert_eq!(data.number_label(), "Borrador");
    }

    #[test]
    fn client_block_includes_vat_number_only_when_set() {
        let labels = Labels::es();

        let with_vat = sample_invoice(Some("BG123456789"), None);
        let lines = client_block_lines(&with_vat, &labels);
        assert!(lines.iter().any(|l| l.contains("BG123456789")));

        let without_vat = sample_invoice(None, None);
        let lines = client_block_lines(&without_vat, &labels);
        assert!(!lines.iter().any(|l| l.contains(labels.vat_number)));
    }

    #[test]
    fn client_block_omits_tax_id_for_non_spanish_clients() {
        let labels = Labels::es();

        let foreign = sample_invoice_with_treatment(
            Some("BG123456789"),
            None,
            "reverse_charge_eu",
        );
        let lines = client_block_lines(&foreign, &labels);
        assert!(!lines.iter().any(|l| l.contains(labels.tax_id)));
        assert!(lines.iter().any(|l| l.contains("BG123456789")));

        let domestic = sample_invoice(Some("ESB12345678"), None);
        let lines = client_block_lines(&domestic, &labels);
        assert!(lines.iter().any(|l| l.contains(labels.tax_id)));
    }

    #[test]
    fn totals_lines_include_rates_and_negative_irpf() {
        let labels = Labels::es();
        let data = sample_invoice(None, None);
        let rows = totals_lines(&data, &labels);
        assert_eq!(rows.len(), 4);
        assert!(rows[1].0.contains("21"));
        assert!(rows[2].1.starts_with('-'));
    }

    #[test]
    fn totals_lines_omit_irpf_row_when_not_applicable() {
        let labels = Labels::es();
        let mut data = sample_invoice(None, None);
        data.irpf_rate = None;
        data.irpf_amount = None;
        data.total = 121.0;
        let rows = totals_lines(&data, &labels);
        assert_eq!(rows.len(), 3);
        assert!(!rows.iter().any(|(label, _)| label.contains(labels.irpf)));
    }

    #[test]
    fn format_eur_matches_frontend_convention() {
        assert_eq!(format_eur(1234.5), "1.234,50 €");
        assert_eq!(format_eur(-15.0), "-15,00 €");
    }

    #[test]
    fn generate_pdf_smoke_test_es_and_en() {
        let business = BusinessProfile {
            name: "Marta Ibáñez Ruiz".to_string(),
            nif_cif: "12345678Z".to_string(),
            vat_number: "ES12345678Z".to_string(),
            address: "Calle de la Reina 14, Madrid".to_string(),
            bank_name: "Banco Santander".to_string(),
            iban: "ES12 3456 7890 1234 5678 9012".to_string(),
            bic: "BSCHESMMXXX".to_string(),
        };

        for (language, suffix) in [("es", "es"), ("en", "en")] {
            let mut data = sample_invoice(Some("BG123456789"), Some("Nota de IVA de prueba"));
            data.language = language.to_string();
            let out_path = std::env::temp_dir().join(format!("automono_pdf_test_{suffix}.pdf"));
            generate_pdf(&business, &data, &out_path).expect("generate_pdf succeeds");

            let bytes = std::fs::read(&out_path).expect("read generated pdf");
            assert!(!bytes.is_empty());
            assert!(bytes.starts_with(b"%PDF-"));

            std::fs::remove_file(&out_path).ok();
        }
    }

    #[test]
    fn generate_pdf_smoke_test_rectification() {
        let business = BusinessProfile {
            name: "Marta Ibáñez Ruiz".to_string(),
            nif_cif: "12345678Z".to_string(),
            vat_number: "ES12345678Z".to_string(),
            address: "Calle de la Reina 14, Madrid".to_string(),
            bank_name: "Banco Santander".to_string(),
            iban: "ES12 3456 7890 1234 5678 9012".to_string(),
            bic: "BSCHESMMXXX".to_string(),
        };

        let mut data = sample_invoice(None, None);
        data.is_rectification = true;
        data.rectifies_number_label = Some("ACM-007".to_string());
        data.rectification_reason = Some("cliente canceló el servicio".to_string());

        let out_path = std::env::temp_dir().join("automono_pdf_test_rectification.pdf");
        generate_pdf(&business, &data, &out_path).expect("generate_pdf succeeds");

        let bytes = std::fs::read(&out_path).expect("read generated pdf");
        assert!(!bytes.is_empty());
        assert!(bytes.starts_with(b"%PDF-"));

        std::fs::remove_file(&out_path).ok();
    }
}

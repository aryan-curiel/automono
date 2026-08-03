use std::path::Path;

use serde::Serialize;

/// Best-effort fields pulled from a receipt PDF's text layer. Every field is `None` when not
/// found — the caller (GastoForm) only prefills currently-empty form fields, so a miss just
/// means "nothing to prefill," not an error.
#[derive(Serialize, Default, Debug, PartialEq)]
pub struct ReceiptFields {
    pub date: Option<String>,
    pub amount: Option<f64>,
    pub iva_amount: Option<f64>,
    pub vendor_guess: Option<String>,
}

/// Extracts raw text from a PDF via its embedded text layer. Returns an empty string (not an
/// error) for anything unreadable as text — a scanned/image-only PDF has no text layer, and the
/// caller degrades to "nothing extracted" rather than failing the attach over it.
///
/// `pdf_extract`'s CMap parser is known to *panic* (not return `Err`) on some real-world
/// embedded-font encodings rather than erroring, so this also catches that — one malformed
/// receipt PDF must not crash extraction (or the app) for everyone else.
fn extract_text(path: &Path) -> String {
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| pdf_extract::extract_text(path)))
        .ok()
        .and_then(Result::ok)
        .unwrap_or_default()
}

/// Parses a number written in Spanish (`"1.234,56"`) or plain (`"1234.56"`) receipt style.
fn parse_amount(raw: &str) -> Option<f64> {
    let cleaned: String = raw.chars().filter(|c| c.is_ascii_digit() || *c == ',' || *c == '.').collect();
    if cleaned.is_empty() {
        return None;
    }
    let normalized = match cleaned.rfind(',') {
        // Comma is the decimal separator; any '.' before it is a thousands separator.
        Some(comma_pos) => {
            let (whole, frac) = cleaned.split_at(comma_pos);
            format!("{}.{}", whole.replace('.', ""), &frac[1..])
        }
        None => cleaned,
    };
    normalized.parse::<f64>().ok()
}

/// Pulls the last number on any line containing `keyword` (case-insensitive), scanning from the
/// bottom of the text up. Receipts print subtotal/IVA/total top-to-bottom, so the last matching
/// line is the final, authoritative one, and the last number on it is the amount (not a rate,
/// quantity, or line-item count that might precede it on the same line).
fn last_number_on_line_containing(text: &str, keyword: &str) -> Option<f64> {
    let keyword = keyword.to_lowercase();
    text.lines().filter(|line| line.to_lowercase().contains(&keyword)).rev().find_map(|line| {
        line.split(|c: char| c.is_whitespace())
            .filter(|t| t.chars().any(|c| c.is_ascii_digit()))
            .filter_map(parse_amount)
            .next_back()
    })
}

fn is_valid_date(year: &str, month: &str, day: &str) -> bool {
    let (Ok(y), Ok(m), Ok(d)) = (year.parse::<u32>(), month.parse::<u32>(), day.parse::<u32>()) else {
        return false;
    };
    (1900..=2100).contains(&y) && (1..=12).contains(&m) && (1..=31).contains(&d)
}

/// Finds the first `DD/MM/YYYY`, `DD-MM-YYYY`, or ISO `YYYY-MM-DD` date and normalizes it to
/// ISO. Hand-rolled token scan rather than a regex dependency — the shape is narrow enough
/// (fixed separator, 3 numeric groups) that splitting is simpler than adding a crate for it.
fn find_date(text: &str) -> Option<String> {
    for token in text.split(|c: char| !c.is_ascii_digit() && c != '/' && c != '-') {
        let sep = if token.contains('/') {
            '/'
        } else if token.matches('-').count() >= 2 {
            '-'
        } else {
            continue;
        };
        let parts: Vec<&str> = token.split(sep).collect();
        let [a, b, c] = parts.as_slice() else { continue };
        if a.len() == 4 && is_valid_date(a, b, c) {
            return Some(format!("{a}-{b:0>2}-{c:0>2}")); // ISO: YYYY-MM-DD
        }
        let year = match c.len() {
            4 => c.to_string(),
            2 => format!("20{c}"),
            _ => continue,
        };
        if is_valid_date(&year, b, a) {
            return Some(format!("{year}-{b:0>2}-{a:0>2}")); // DD/MM/YY(YY)
        }
    }
    None
}

const NON_VENDOR_KEYWORDS: [&str; 5] = ["total", "iva", "fecha", "factura", "subtotal"];

/// First short, non-blank line that isn't itself a date/total/IVA line — a cheap stand-in for a
/// vendor name (receipts usually open with the business name), used as a category-field guess.
fn guess_vendor(text: &str) -> Option<String> {
    text.lines()
        .map(str::trim)
        .find(|line| {
            !line.is_empty()
                && line.len() < 60
                && !NON_VENDOR_KEYWORDS.iter().any(|kw| line.to_lowercase().contains(kw))
        })
        .map(str::to_string)
}

pub fn extract_receipt_fields(path: &Path) -> ReceiptFields {
    let text = extract_text(path);
    ReceiptFields {
        date: find_date(&text),
        amount: last_number_on_line_containing(&text, "total"),
        iva_amount: last_number_on_line_containing(&text, "iva"),
        vendor_guess: guess_vendor(&text),
    }
}

#[tauri::command]
pub async fn extract_receipt_fields_cmd(file_path: String) -> Result<ReceiptFields, String> {
    Ok(extract_receipt_fields(Path::new(&file_path)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_amount_handles_spanish_and_plain_decimals() {
        assert_eq!(parse_amount("1.234,56"), Some(1234.56));
        assert_eq!(parse_amount("45,00"), Some(45.0));
        assert_eq!(parse_amount("45.00"), Some(45.0));
        assert_eq!(parse_amount("€"), None);
    }

    #[test]
    fn last_number_on_line_containing_finds_the_amount_not_the_rate() {
        let text = "Subtotal: 100,00\nIVA (21%): 21,00\nTotal: 121,00";
        assert_eq!(last_number_on_line_containing(text, "total"), Some(121.0));
        assert_eq!(last_number_on_line_containing(text, "iva"), Some(21.0));
    }

    #[test]
    fn find_date_normalizes_spanish_and_iso_formats() {
        assert_eq!(find_date("Fecha: 02/08/2026"), Some("2026-08-02".to_string()));
        assert_eq!(find_date("Fecha: 02-08-2026"), Some("2026-08-02".to_string()));
        assert_eq!(find_date("Emitido el 2026-08-02 a las 10:00"), Some("2026-08-02".to_string()));
        assert_eq!(find_date("Sin fecha aquí"), None);
    }

    #[test]
    fn guess_vendor_skips_keyword_lines_and_takes_first_plain_line() {
        let text = "\n  Ferretería García SL  \nFecha: 02/08/2026\nTotal: 45,00";
        assert_eq!(guess_vendor(text), Some("Ferretería García SL".to_string()));
    }

    #[test]
    fn extract_receipt_fields_reads_all_fields_from_a_real_pdf() {
        let out_path = std::env::temp_dir()
            .join(format!("automono_receipt_extract_test_{}.pdf", std::process::id()));
        write_sample_receipt_pdf(&out_path);

        let fields = extract_receipt_fields(&out_path);
        assert_eq!(fields.date.as_deref(), Some("2026-08-02"));
        assert_eq!(fields.amount, Some(121.0));
        assert_eq!(fields.iva_amount, Some(21.0));
        assert_eq!(fields.vendor_guess.as_deref(), Some("Ferreteria Garcia SL"));

        std::fs::remove_file(&out_path).ok();
    }

    #[test]
    fn extract_receipt_fields_degrades_gracefully_on_a_non_pdf_file() {
        let out_path = std::env::temp_dir()
            .join(format!("automono_receipt_extract_bad_{}.pdf", std::process::id()));
        std::fs::write(&out_path, b"not a pdf").unwrap();

        let fields = extract_receipt_fields(&out_path);
        assert_eq!(fields, ReceiptFields::default());

        std::fs::remove_file(&out_path).ok();
    }

    /// Hand-builds a minimal, valid single-page PDF with a plain (non-embedded) Helvetica
    /// content stream — one line of text per `lines` entry. `genpdf`'s embedded-TrueType output
    /// (used for real invoices) isn't reliably readable by `pdf_extract`'s CMap parser, so a
    /// fixture using a standard base-14 font is what actually exercises the extraction path.
    fn build_minimal_pdf(lines: &[&str]) -> Vec<u8> {
        let mut buf: Vec<u8> = Vec::new();
        let mut offsets = [0usize; 6];
        buf.extend_from_slice(b"%PDF-1.4\n");

        offsets[1] = buf.len();
        buf.extend_from_slice(b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
        offsets[2] = buf.len();
        buf.extend_from_slice(b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
        offsets[3] = buf.len();
        buf.extend_from_slice(
            b"3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> \
              /MediaBox [0 0 612 792] /Contents 5 0 R >>\nendobj\n",
        );
        offsets[4] = buf.len();
        buf.extend_from_slice(b"4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");

        let mut content = String::from("BT /F1 12 Tf 72 700 Td\n");
        for (i, line) in lines.iter().enumerate() {
            if i > 0 {
                content.push_str("0 -20 Td\n");
            }
            let escaped = line.replace('\\', "\\\\").replace('(', "\\(").replace(')', "\\)");
            content.push_str(&format!("({escaped}) Tj\n"));
        }
        content.push_str("ET");

        offsets[5] = buf.len();
        buf.extend_from_slice(
            format!("5 0 obj\n<< /Length {} >>\nstream\n{content}\nendstream\nendobj\n", content.len())
                .as_bytes(),
        );

        let xref_offset = buf.len();
        buf.extend_from_slice(b"xref\n0 6\n0000000000 65535 f \n");
        for offset in &offsets[1..] {
            buf.extend_from_slice(format!("{offset:010} 00000 n \n").as_bytes());
        }
        buf.extend_from_slice(
            format!("trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF").as_bytes(),
        );
        buf
    }

    fn write_sample_receipt_pdf(out_path: &Path) {
        let pdf = build_minimal_pdf(&[
            "Ferreteria Garcia SL",
            "Fecha: 02/08/2026",
            "Subtotal: 100,00",
            "IVA (21%): 21,00",
            "Total: 121,00",
        ]);
        std::fs::write(out_path, pdf).expect("write sample receipt pdf");
    }
}

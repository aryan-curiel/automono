use std::path::Path;

use base64::Engine as _;
use rig::completion::message::ImageMediaType;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::llm;

/// Best-effort fields pulled from a receipt PDF's text layer. Every field is `None` when not
/// found — the caller (GastoForm) only prefills currently-empty form fields, so a miss just
/// means "nothing to prefill," not an error.
#[derive(Serialize, Default, Debug, PartialEq)]
pub struct ReceiptFields {
    pub date: Option<String>,
    pub amount: Option<f64>,
    pub iva_amount: Option<f64>,
    pub irpf_rate: Option<f64>,
    pub irpf_amount: Option<f64>,
    pub vendor_guess: Option<String>,
}

/// Extracts raw text from a PDF via its embedded text layer. Returns an empty string (not an
/// error) for anything unreadable as text — a scanned/image-only PDF has no text layer, and the
/// caller degrades to "nothing extracted" rather than failing the attach over it.
///
/// `pdf_extract`'s CMap parser is known to *panic* (not return `Err`) on some real-world
/// embedded-font encodings rather than erroring, so this also catches that — one malformed
/// receipt PDF must not crash extraction (or the app) for everyone else.
pub(crate) fn extract_text(path: &Path) -> String {
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
pub(crate) fn last_number_on_line_containing(text: &str, keyword: &str) -> Option<f64> {
    let keyword = keyword.to_lowercase();
    text.lines().filter(|line| line.to_lowercase().contains(&keyword)).rev().find_map(|line| {
        line.split(|c: char| c.is_whitespace())
            .filter(|t| t.chars().any(|c| c.is_ascii_digit()))
            .filter_map(parse_amount)
            .next_back()
    })
}

/// Pulls a percentage rate (`7%`, `(7%)`, `-7%`) from the last line containing `keyword`, same
/// bottom-up "last matching line wins" logic as `last_number_on_line_containing`, applied to the
/// digits immediately preceding a `%` sign instead of the last number on the line.
fn last_percent_on_line_containing(text: &str, keyword: &str) -> Option<f64> {
    let keyword = keyword.to_lowercase();
    text.lines().filter(|line| line.to_lowercase().contains(&keyword)).rev().find_map(|line| {
        line.split('%').find_map(|before| {
            let digits: String =
                before.chars().rev().take_while(|c| c.is_ascii_digit() || *c == ',' || *c == '.').collect();
            parse_amount(&digits.chars().rev().collect::<String>())
        })
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

const NON_VENDOR_KEYWORDS: [&str; 7] = ["total", "iva", "fecha", "factura", "subtotal", "retenc", "irpf"];

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
    let irpf_amount = last_number_on_line_containing(&text, "retenc")
        .or_else(|| last_number_on_line_containing(&text, "irpf"));
    let irpf_rate = last_percent_on_line_containing(&text, "retenc")
        .or_else(|| last_percent_on_line_containing(&text, "irpf"));
    ReceiptFields {
        date: find_date(&text),
        amount: last_number_on_line_containing(&text, "total"),
        iva_amount: last_number_on_line_containing(&text, "iva"),
        irpf_rate,
        irpf_amount,
        vendor_guess: guess_vendor(&text),
    }
}

#[tauri::command]
pub async fn extract_receipt_fields_cmd(file_path: String) -> Result<ReceiptFields, String> {
    Ok(extract_receipt_fields(Path::new(&file_path)))
}

/// Some models emit the JSON string `"null"` instead of the JSON literal `null` for an optional
/// numeric field they want to leave empty (observed via OpenRouter) — which a plain `Option<f64>`
/// can't deserialize, and crashes the whole extraction over one empty field. Accepts a real
/// number, an actual JSON null, or a string (parsed as a number, or treated as absent if it's
/// blank/"null").
pub(crate) fn lenient_f64_option<'de, D>(deserializer: D) -> Result<Option<f64>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum NumOrString {
        Num(f64),
        Str(String),
    }
    match Option::<NumOrString>::deserialize(deserializer)? {
        None => Ok(None),
        Some(NumOrString::Num(n)) => Ok(Some(n)),
        Some(NumOrString::Str(s)) => {
            let trimmed = s.trim();
            if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("null") {
                Ok(None)
            } else {
                trimmed.parse::<f64>().map(Some).map_err(serde::de::Error::custom)
            }
        }
    }
}

/// LLM-extracted receipt fields — same shape as [`ReceiptFields`] plus `category`, since an LLM
/// (unlike the regex scanner above) can actually match the receipt against the user's real
/// category list. Every field stays `Option` and is marked `required` in the generated JSON
/// schema so the model always considers it but can still say "not present" with `null`.
#[derive(Debug, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct ReceiptFieldsLlm {
    /// The receipt date, normalized to ISO 8601 (YYYY-MM-DD).
    #[schemars(required)]
    pub date: Option<String>,
    /// The total amount charged, in the receipt's currency, as a plain number.
    #[schemars(required)]
    #[serde(default, deserialize_with = "lenient_f64_option")]
    pub amount: Option<f64>,
    /// The IVA (Spanish VAT) amount shown on the receipt, if any.
    #[schemars(required)]
    #[serde(default, deserialize_with = "lenient_f64_option")]
    pub iva_amount: Option<f64>,
    /// The IRPF withholding rate (a percentage, e.g. 7 for 7%) shown on the receipt, if any.
    /// Most receipts have no IRPF retention at all.
    #[schemars(required)]
    #[serde(default, deserialize_with = "lenient_f64_option")]
    pub irpf_rate: Option<f64>,
    /// The IRPF withholding amount shown on the receipt, if any.
    #[schemars(required)]
    #[serde(default, deserialize_with = "lenient_f64_option")]
    pub irpf_amount: Option<f64>,
    /// A short guess at the vendor/business name issuing the receipt.
    #[schemars(required)]
    pub vendor_guess: Option<String>,
    /// The best-matching expense category, chosen from the list given in the preamble.
    #[schemars(required)]
    pub category: Option<String>,
}

fn extension_of(file_path: &str) -> String {
    Path::new(file_path).extension().and_then(|e| e.to_str()).unwrap_or_default().to_lowercase()
}

fn build_extraction_preamble(categories: &[String]) -> String {
    format!(
        "You are extracting structured data from a Spanish business expense receipt (a photo or \
         PDF of a receipt/invoice). Extract the date, total amount, IVA (VAT) amount, IRPF \
         withholding rate and amount (most receipts have none), a short vendor name guess, and the \
         best-matching expense category. For category, pick exactly one name from this list, \
         matching it exactly, or leave it null if none clearly fit: {}. Leave any other field null \
         if it cannot be determined confidently from the receipt.",
        categories.join(", ")
    )
}

/// The model is free-texting the category name back; only accept it if it matches one of the
/// user's actual categories (case-insensitively) — anything else means "don't prefill it."
fn normalize_category(category: Option<String>, categories: &[String]) -> Option<String> {
    let category = category?;
    categories.iter().find(|c| c.eq_ignore_ascii_case(&category)).cloned()
}

#[tauri::command]
pub async fn extract_receipt_fields_llm_cmd(
    file_path: String,
    provider: String,
    api_key: String,
    model: Option<String>,
    categories: Vec<String>,
) -> Result<ReceiptFieldsLlm, String> {
    let provider = llm::Provider::parse(&provider)?;
    let bytes = std::fs::read(&file_path).map_err(|e| e.to_string())?;
    let base64_data = base64::engine::general_purpose::STANDARD.encode(&bytes);

    let content = match extension_of(&file_path).as_str() {
        "pdf" => llm::pdf_content(base64_data),
        "png" => llm::image_content(base64_data, ImageMediaType::PNG),
        "jpg" | "jpeg" => llm::image_content(base64_data, ImageMediaType::JPEG),
        other => return Err(format!("unsupported receipt file type: {other}")),
    };

    let preamble = build_extraction_preamble(&categories);
    let config = llm::ProviderConfig { provider, api_key, model };
    let mut fields: ReceiptFieldsLlm = llm::extract(&config, &preamble, content).await?;
    let raw_category = fields.category.clone();
    fields.category = normalize_category(fields.category, &categories);
    // Diagnostic: the model answered but its category didn't survive exact matching — log the
    // raw value so a mismatch (wrong spelling, paraphrase, category not in the list it was given)
    // is visible instead of silently degrading to "no category" with no trace of why.
    if raw_category.is_some() && fields.category.is_none() {
        eprintln!(
            "receipt category mismatch: model returned {raw_category:?}, none of the configured categories matched: {categories:?}"
        );
    }
    Ok(fields)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deserializes_when_model_returns_stringified_null_for_a_numeric_field() {
        // Reproduces a real failure: some models emit the JSON string "null" instead of the
        // JSON literal null for an optional numeric field it wants to leave empty (observed via
        // OpenRouter on a Claude bill with no IVA/IRPF to report).
        let json = r#"{"date":"2026-07-06","amount":18.0,"iva_amount":"null","irpf_rate":null,"irpf_amount":null,"vendor_guess":"Anthropic","category":"Software y Subscripciones"}"#;
        let fields: ReceiptFieldsLlm =
            serde_json::from_str(json).expect("should tolerate a stringified null");
        assert_eq!(fields.amount, Some(18.0));
        assert_eq!(fields.iva_amount, None);
        assert_eq!(fields.category.as_deref(), Some("Software y Subscripciones"));
    }

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
    fn last_percent_on_line_containing_finds_the_rate() {
        let text = "IVA (21%): 21,00\nRetencion IRPF (7%): -7,00";
        assert_eq!(last_percent_on_line_containing(text, "retenc"), Some(7.0));
        assert_eq!(last_percent_on_line_containing(text, "iva"), Some(21.0));
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
    fn extract_receipt_fields_reads_irpf_retention_from_a_real_pdf() {
        let out_path = std::env::temp_dir()
            .join(format!("automono_receipt_extract_irpf_test_{}.pdf", std::process::id()));
        let pdf = build_minimal_pdf(&[
            "Gestoria Lopez SL",
            "Fecha: 02/08/2026",
            "Subtotal: 100,00",
            "IVA (21%): 21,00",
            "Retencion IRPF (7%): -7,00",
            "Total: 114,00",
        ]);
        std::fs::write(&out_path, pdf).expect("write sample receipt pdf");

        let fields = extract_receipt_fields(&out_path);
        assert_eq!(fields.irpf_rate, Some(7.0));
        assert_eq!(fields.irpf_amount, Some(7.0));

        std::fs::remove_file(&out_path).ok();
    }

    #[test]
    fn extension_of_lowercases_and_strips_the_dot() {
        assert_eq!(extension_of("/tmp/Receipt.PDF"), "pdf");
        assert_eq!(extension_of("/tmp/photo.JPG"), "jpg");
        assert_eq!(extension_of("/tmp/no_extension"), "");
    }

    #[test]
    fn normalize_category_matches_case_insensitively() {
        let categories = vec!["Suministros".to_string(), "Material".to_string()];
        assert_eq!(
            normalize_category(Some("suministros".to_string()), &categories),
            Some("Suministros".to_string())
        );
        assert_eq!(normalize_category(Some("Unknown".to_string()), &categories), None);
        assert_eq!(normalize_category(None, &categories), None);
    }

    #[test]
    fn build_extraction_preamble_lists_every_category() {
        let categories = vec!["Suministros".to_string(), "Material".to_string()];
        let preamble = build_extraction_preamble(&categories);
        assert!(preamble.contains("Suministros"));
        assert!(preamble.contains("Material"));
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

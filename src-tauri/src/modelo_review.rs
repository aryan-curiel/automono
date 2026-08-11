//! Detects which Spanish tax "modelo" (303/130/111) an uploaded PDF is, pulls its declared
//! period (ejercicio/trimestre) and headline figures, and hands both back to the frontend —
//! which owns the actual comparison against AutoMono's own calculated totals (business logic
//! lives in `src/lib/`, not here; this module is IO/extraction only, same split as
//! `receipt_extract.rs`).

use std::path::Path;

use base64::Engine as _;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::llm;
use crate::receipt_extract::{extract_text, last_number_on_line_containing, lenient_f64_option};

pub const MODELOS: [&str; 3] = ["303", "130", "111"];

#[derive(Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct ModeloDetection {
    pub modelo: String,
    pub year: Option<i32>,
    pub quarter: Option<i32>,
}

/// Every AEAT modelo PDF prints a literal "Modelo 303"/"Modelo 130"/"Modelo 111" header —
/// a plain substring search is cheaper and more reliable here than an LLM call.
fn detect_modelo_type(text: &str) -> Option<String> {
    let lower = text.to_lowercase();
    MODELOS.iter().find(|m| lower.contains(&format!("modelo {m}"))).map(|s| s.to_string())
}

/// Finds a plausible year (a bare 4-digit token, 2000-2099) on a line mentioning `keyword`
/// (e.g. "Ejercicio"). Deliberately narrower than `last_number_on_line_containing` — that helper
/// takes the *last* number on the line, which on an AEAT header line (NIF, ejercicio, etc. often
/// share a line) is as likely to be a NIF digit run as the year.
fn find_year_on_line_containing(text: &str, keyword: &str) -> Option<i32> {
    let keyword = keyword.to_lowercase();
    text.lines().filter(|line| line.to_lowercase().contains(&keyword)).find_map(|line| {
        line.split(|c: char| !c.is_ascii_digit())
            .find(|tok| tok.len() == 4)
            .and_then(|tok| tok.parse::<i32>().ok())
            .filter(|y| (2000..=2099).contains(y))
    })
}

/// Finds AEAT's own trimester marker in `word` — "1T".."4T" or "T1".."T4", since different modelo
/// layouts print the digit and the "T" in either order — trimming any attached punctuation first.
fn quarter_from_word(word: &str) -> Option<i32> {
    let word = word.trim_matches(|c: char| !c.is_ascii_alphanumeric());
    if word.chars().count() != 2 {
        return None;
    }
    let (a, b) = (word.chars().next()?, word.chars().nth(1)?);
    let (marker, digit) = if a.eq_ignore_ascii_case(&'T') { (a, b) } else { (b, a) };
    marker.eq_ignore_ascii_case(&'T').then(|| digit.to_digit(10)).flatten().map(|d| d as i32).filter(|q| (1..=4).contains(q))
}

/// A plausible year (2000-2099) in `word`, trimming any attached punctuation first.
fn year_from_word(word: &str) -> Option<i32> {
    let digits = word.trim_matches(|c: char| !c.is_ascii_digit());
    (digits.len() == 4).then(|| digits.parse().ok()).flatten().filter(|y| (2000..=2099).contains(y))
}

/// On a real AEAT PDF the "Período"/"Ejercicio" *labels* are often just printed next to blank
/// dotted lines — the actual filled-in values print elsewhere in reading order, next to each
/// other as two bare words (e.g. "2026 2T"), not next to their labels. Scans whitespace-separated
/// words for the trimester marker and takes the year from whichever neighboring word parses as one.
fn find_year_and_quarter_near_marker(text: &str) -> (Option<i32>, Option<i32>) {
    let words: Vec<&str> = text.split_whitespace().collect();
    for (i, word) in words.iter().enumerate() {
        if let Some(quarter) = quarter_from_word(word) {
            let year = [i.checked_sub(1), Some(i + 1)]
                .into_iter()
                .flatten()
                .find_map(|j| words.get(j).and_then(|w| year_from_word(w)));
            return (year, Some(quarter));
        }
    }
    (None, None)
}

/// No match → hard error, per the "if none, raise an error" requirement — applied identically
/// whether the file arrived via drag-drop or the per-modelo attach button.
pub fn detect_modelo(text: &str) -> Result<ModeloDetection, String> {
    let modelo = detect_modelo_type(text)
        .ok_or_else(|| "No se reconoce como Modelo 303, 130 o 111".to_string())?;
    let (year_near_quarter, quarter) = find_year_and_quarter_near_marker(text);
    Ok(ModeloDetection {
        modelo,
        year: find_year_on_line_containing(text, "ejercicio").or(year_near_quarter),
        quarter,
    })
}

#[tauri::command]
pub async fn detect_modelo_cmd(file_path: String) -> Result<ModeloDetection, String> {
    detect_modelo(&extract_text(Path::new(&file_path)))
}

/// Headline figures the report can actually compare against AutoMono's own calculated totals.
/// Every field is `Option` and modelo-specific — a 303 PDF only ever populates the `iva_*`
/// fields, a 130 only `rendimiento_neto`/`pago_fraccionado`, a 111 only the retention pair.
#[derive(Debug, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct ModeloFields {
    #[schemars(required)]
    #[serde(default, deserialize_with = "lenient_f64_option")]
    pub iva_devengado: Option<f64>,
    #[schemars(required)]
    #[serde(default, deserialize_with = "lenient_f64_option")]
    pub iva_deducible: Option<f64>,
    #[schemars(required)]
    #[serde(default, deserialize_with = "lenient_f64_option")]
    pub resultado_liquidacion: Option<f64>,

    #[schemars(required)]
    #[serde(default, deserialize_with = "lenient_f64_option")]
    pub rendimiento_neto: Option<f64>,
    #[schemars(required)]
    #[serde(default, deserialize_with = "lenient_f64_option")]
    pub pago_fraccionado: Option<f64>,

    #[schemars(required)]
    #[serde(default, deserialize_with = "lenient_f64_option")]
    pub base_retenciones: Option<f64>,
    #[schemars(required)]
    #[serde(default, deserialize_with = "lenient_f64_option")]
    pub retenciones_ingresadas: Option<f64>,
}

fn build_modelo_preamble(modelo: &str) -> String {
    match modelo {
        "303" => "You are extracting figures from a Spanish Modelo 303 (IVA trimestral) tax \
                   form PDF. Casilla 27 and casilla 45 are themselves SUMS of several smaller \
                   Cuota boxes — the form prints the exact formula next to each one. Do not read \
                   the single printed total number for either box; instead locate each of its \
                   listed sub-boxes individually and add them yourself, treating any sub-box with \
                   no visible printed digits as 0. This matters because the two totals sit close \
                   together and a glance at the wrong one silently produces a wrong but plausible \
                   number, whereas summing many small boxes in the \"IVA devengado\" block (for \
                   casilla 27) forces you to look at that block specifically and not the \"IVA \
                   deducible\" block below it: iva_devengado (casilla 27, \"Total cuota \
                   devengada\") = casillas 152+167+03+155+06+09+11+13+15+158+170+18+21+24+26 — \
                   this is legitimately 0 when every one of those Cuota boxes is blank (e.g. all \
                   sales this quarter were exempt, reverse-charge, or intra-EU/export with no \
                   Spanish VAT charged). iva_deducible (casilla 45, \"Total a deducir\") = casillas \
                   29+31+33+35+37+39+41+42+43+44, summed the same way from the \"IVA deducible\" \
                   block. resultado_liquidacion is the final declared result (casilla 71, or 69 if \
                   the form has no page-3 adjustments — the bottom-line amount to pay, offset, or \
                   compensate). Leave a field null only if its entire block cannot be located at \
                   all — a block you did locate and found all-blank is 0, not null. If your summed \
                   iva_devengado and iva_deducible come out equal, that almost always means you \
                   summed the same block twice — go back and re-sum each block from its own listed \
                   sub-boxes independently before answering."
            .to_string(),
        "130" => "You are extracting figures from a Spanish Modelo 130 (pago fraccionado IRPF) \
                   tax form PDF. Extract: rendimiento_neto (rendimiento neto del periodo) and \
                   pago_fraccionado (the resultado a ingresar). Leave a field null if it cannot \
                   be found."
            .to_string(),
        "111" => "You are extracting figures from a Spanish Modelo 111 (retenciones e ingresos a \
                   cuenta IRPF) tax form PDF. Extract: base_retenciones (base de retenciones) and \
                   retenciones_ingresadas (total retenciones e ingresos a cuenta). Leave a field \
                   null if it cannot be found."
            .to_string(),
        other => format!("Extract any figures you can from this Modelo {other} tax form PDF."),
    }
}

/// Regex-free keyword/line scan, same shape as `receipt_extract`'s fallback — used when no LLM
/// is configured or the LLM call fails.
fn extract_modelo_fields_fallback(text: &str, modelo: &str) -> ModeloFields {
    match modelo {
        "303" => ModeloFields {
            iva_devengado: last_number_on_line_containing(text, "iva devengado"),
            iva_deducible: last_number_on_line_containing(text, "iva deducible"),
            resultado_liquidacion: last_number_on_line_containing(text, "resultado"),
            ..Default::default()
        },
        "130" => ModeloFields {
            rendimiento_neto: last_number_on_line_containing(text, "rendimiento neto"),
            pago_fraccionado: last_number_on_line_containing(text, "a ingresar"),
            ..Default::default()
        },
        "111" => ModeloFields {
            base_retenciones: last_number_on_line_containing(text, "base"),
            retenciones_ingresadas: last_number_on_line_containing(text, "retenciones"),
            ..Default::default()
        },
        _ => ModeloFields::default(),
    }
}

/// Box 27 ("Total cuota devengada") and box 45 ("Total a deducir") sit close together on a 303,
/// and an empty box 27 (e.g. an all-exempt quarter) is the case most likely for an LLM to misread
/// as "just copy the nearby box 45 value" rather than 0 — the preamble now asks it to sum sub-boxes
/// instead of trusting either printed total, but that's a prompt, not a guarantee. If devengado and
/// deducible still come back identical, box 45 (the one with actual printed digits — devengado
/// only collides with it, never the reverse, since a genuinely blank 45 has nothing to copy from)
/// is the one worth trusting; devengado is re-derived from the AEAT identity the form itself prints
/// (46 = 27 - 45, and 71/69 equal 46 absent page-3 adjustments) using resultado_liquidacion, which
/// was read independently. Null both out only if there's no resultado to derive from.
/// ponytail: assumes box 45's read is the trustworthy one in a collision — if a symmetric misread
/// (45 blank, copied from 27) ever surfaces, extract the base imponible sub-boxes too to disambiguate.
fn fix_303_devengado_if_misread(fields: &mut ModeloFields) {
    let (Some(devengado), Some(deducible)) = (fields.iva_devengado, fields.iva_deducible) else {
        return;
    };
    if devengado != deducible {
        return;
    }
    match fields.resultado_liquidacion {
        Some(resultado) => fields.iva_devengado = Some(((resultado + deducible) * 100.0).round() / 100.0),
        None => {
            fields.iva_devengado = None;
            fields.iva_deducible = None;
        }
    }
}

#[tauri::command]
pub async fn extract_modelo_fields_cmd(
    file_path: String,
    modelo: String,
    provider: Option<String>,
    api_key: Option<String>,
    model: Option<String>,
) -> Result<ModeloFields, String> {
    let text = extract_text(Path::new(&file_path));

    let configured = provider.zip(api_key).filter(|(_, key)| !key.trim().is_empty());
    if let Some((provider, api_key)) = configured {
        if let Ok(provider) = llm::Provider::parse(&provider) {
            let bytes = std::fs::read(&file_path).map_err(|e| e.to_string())?;
            let base64_data = base64::engine::general_purpose::STANDARD.encode(&bytes);
            let config = llm::ProviderConfig { provider, api_key, model };
            let preamble = build_modelo_preamble(&modelo);
            if let Ok(mut fields) =
                llm::extract::<ModeloFields>(&config, &preamble, llm::pdf_content(base64_data)).await
            {
                if modelo == "303" {
                    fix_303_devengado_if_misread(&mut fields);
                }
                return Ok(fields);
            }
        }
    }

    let mut fields = extract_modelo_fields_fallback(&text, &modelo);
    if modelo == "303" {
        fix_303_devengado_if_misread(&mut fields);
    }
    Ok(fields)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detect_modelo_reads_number_and_period_from_header_text() {
        let text = "MODELO 303\nAutoliquidación\nEjercicio 2026 NIF 12345678Z\nPeriodo 3T\n";
        let detection = detect_modelo(text).expect("303 should be detected");
        assert_eq!(detection.modelo, "303");
        assert_eq!(detection.year, Some(2026));
        assert_eq!(detection.quarter, Some(3));
    }

    #[test]
    fn detect_modelo_distinguishes_130_and_111() {
        assert_eq!(detect_modelo("Modelo 130 Pago fraccionado").unwrap().modelo, "130");
        assert_eq!(detect_modelo("Modelo 111 Retenciones").unwrap().modelo, "111");
    }

    #[test]
    fn detect_modelo_errors_when_no_known_modelo_header_is_present() {
        assert!(detect_modelo("Factura ordinaria, no es un modelo tributario").is_err());
    }

    #[test]
    fn find_year_on_line_containing_ignores_a_longer_number_on_the_same_line() {
        let text = "Ejercicio 2026 NIF 123456789Z";
        assert_eq!(find_year_on_line_containing(text, "ejercicio"), Some(2026));
    }

    #[test]
    fn find_year_and_quarter_near_marker_reads_trimester_code_either_order() {
        assert_eq!(find_year_and_quarter_near_marker("Periodo: 3T").1, Some(3));
        assert_eq!(find_year_and_quarter_near_marker("Periodo: T2").1, Some(2));
        assert_eq!(find_year_and_quarter_near_marker("Sin periodo aqui"), (None, None));
    }

    #[test]
    fn find_year_and_quarter_near_marker_reads_year_from_the_adjacent_word() {
        // Real AEAT layout: label line is blank dotted placeholders, the filled year/trimester
        // print together elsewhere as bare words, e.g. "X1234567L GARCIA LOPEZ MARIA\n 2026 2T".
        let text = "Período .....  Ejercicio ...  \nX1234567L GARCIA LOPEZ MARIA\n 2026 2T\n1 100,00 15,00";
        assert_eq!(find_year_and_quarter_near_marker(text), (Some(2026), Some(2)));
    }

    #[test]
    fn detect_modelo_falls_back_to_the_year_next_to_the_quarter_marker() {
        let text = "Modelo 111\nPeríodo .....  Ejercicio ...  \nX1234567L GARCIA LOPEZ MARIA\n 2026 2T\n";
        let detection = detect_modelo(text).expect("111 should be detected");
        assert_eq!(detection.year, Some(2026));
        assert_eq!(detection.quarter, Some(2));
    }

    #[test]
    fn extract_modelo_fields_fallback_reads_303_totals() {
        let text = "Subtotal\nIVA devengado: 210,00\nIVA deducible: 50,00\nResultado: 160,00";
        let fields = extract_modelo_fields_fallback(text, "303");
        assert_eq!(fields.iva_devengado, Some(210.0));
        assert_eq!(fields.iva_deducible, Some(50.0));
        assert_eq!(fields.resultado_liquidacion, Some(160.0));
    }

    #[test]
    fn rederives_303_devengado_from_resultado_when_identical_to_deducible() {
        // The exact case reported: casilla 27 is blank (true devengado 0), casilla 45 is 14,92,
        // and the LLM misread 27 as a copy of 45. resultado_liquidacion (-14,92 = 0 - 14,92) was
        // read independently and correctly, so it should pull devengado back to 0.
        let mut fields = ModeloFields {
            iva_devengado: Some(14.92),
            iva_deducible: Some(14.92),
            resultado_liquidacion: Some(-14.92),
            ..Default::default()
        };
        fix_303_devengado_if_misread(&mut fields);
        assert_eq!(fields.iva_devengado, Some(0.0));
        assert_eq!(fields.iva_deducible, Some(14.92));
    }

    #[test]
    fn clears_303_devengado_and_deducible_when_identical_and_no_resultado_to_derive_from() {
        let mut fields = ModeloFields { iva_devengado: Some(14.92), iva_deducible: Some(14.92), ..Default::default() };
        fix_303_devengado_if_misread(&mut fields);
        assert_eq!(fields.iva_devengado, None);
        assert_eq!(fields.iva_deducible, None);
    }

    #[test]
    fn leaves_303_devengado_and_deducible_alone_when_different() {
        let mut fields = ModeloFields { iva_devengado: Some(210.0), iva_deducible: Some(50.0), ..Default::default() };
        fix_303_devengado_if_misread(&mut fields);
        assert_eq!(fields.iva_devengado, Some(210.0));
        assert_eq!(fields.iva_deducible, Some(50.0));
    }

    #[test]
    fn extract_modelo_fields_fallback_reads_130_totals() {
        let text = "Rendimiento neto: 1000,00\nA ingresar: 200,00";
        let fields = extract_modelo_fields_fallback(text, "130");
        assert_eq!(fields.rendimiento_neto, Some(1000.0));
        assert_eq!(fields.pago_fraccionado, Some(200.0));
    }

    #[test]
    fn extract_modelo_fields_fallback_reads_111_totals() {
        let text = "Base de retenciones: 500,00\nTotal retenciones: 35,00";
        let fields = extract_modelo_fields_fallback(text, "111");
        assert_eq!(fields.base_retenciones, Some(500.0));
        assert_eq!(fields.retenciones_ingresadas, Some(35.0));
    }
}

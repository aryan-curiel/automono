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

/// Finds AEAT's own trimester marker ("1T".."4T", printed next to "Periodo" on quarterly
/// modelos) anywhere in the text.
fn find_quarter_marker(text: &str) -> Option<i32> {
    text.split(|c: char| !c.is_ascii_alphanumeric()).find_map(|tok| {
        if tok.len() != 2 {
            return None;
        }
        let mut chars = tok.chars();
        let digit = chars.next()?.to_digit(10)?;
        let marker = chars.next()?;
        (marker == 'T' || marker == 't').then_some(digit as i32).filter(|q| (1..=4).contains(q))
    })
}

/// No match → hard error, per the "if none, raise an error" requirement — applied identically
/// whether the file arrived via drag-drop or the per-modelo attach button.
pub fn detect_modelo(text: &str) -> Result<ModeloDetection, String> {
    let modelo = detect_modelo_type(text)
        .ok_or_else(|| "No se reconoce como Modelo 303, 130 o 111".to_string())?;
    Ok(ModeloDetection {
        modelo,
        year: find_year_on_line_containing(text, "ejercicio"),
        quarter: find_quarter_marker(text),
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
                   form PDF. Extract: iva_devengado (total IVA devengado across all rates), \
                   iva_deducible (total IVA deducible/soportado), and resultado_liquidacion (the \
                   final resultado de la liquidación — amount to pay or offset). Leave a field \
                   null if it cannot be found."
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
            if let Ok(fields) =
                llm::extract::<ModeloFields>(&config, &preamble, llm::pdf_content(base64_data)).await
            {
                return Ok(fields);
            }
        }
    }

    Ok(extract_modelo_fields_fallback(&text, &modelo))
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
    fn find_quarter_marker_reads_trimester_code() {
        assert_eq!(find_quarter_marker("Periodo: 3T"), Some(3));
        assert_eq!(find_quarter_marker("Sin periodo aqui"), None);
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

use std::path::Path;

use base64::Engine as _;
use rig::completion::message::ImageMediaType;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

use crate::contracts::copy_into;
use crate::llm;

/// Copies `source` into `app_data_dir()/documentos_autonomo/`, named after its own original
/// file stem — unlike a fixed registration slot, this is a free-form, growing list of
/// documents, so a name collision gets a counter suffix (via `copy_into`) rather than
/// overwriting a previous upload.
fn attach_business_document(app: &AppHandle, source_path: &str) -> std::io::Result<String> {
    let dest_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| std::io::Error::other(e.to_string()))?
        .join("documentos_autonomo");
    let stem = Path::new(source_path)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    let dest_path = copy_into(Path::new(source_path), &dest_dir, &stem)?;
    Ok(dest_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn attach_business_document_cmd(app: AppHandle, source_path: String) -> Result<String, String> {
    attach_business_document(&app, &source_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn open_business_document_file_cmd(app: AppHandle, file_path: String) -> Result<(), String> {
    app.opener().open_path(file_path, None::<&str>).map_err(|e| e.to_string())
}

/// Fields extracted from an arbitrary business-relevant document (a Spanish tax/social-security
/// registration paper, a receipt, a contract, or anything else the user drops in — there's no
/// fixed set of expected types). Every field is `Option` and marked `required` in the generated
/// JSON schema so the model always considers it but can still say "not present" with `null` — a
/// miss just means nothing to prefill, not an error.
#[derive(Debug, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct RegistrationFieldsLlm {
    /// A short Spanish label identifying what kind of document this is (e.g. "Certificado de
    /// Situación Censal", "Factura de electricidad", "Contrato de arrendamiento").
    #[schemars(required)]
    pub label: Option<String>,
    /// The business/self-employed person's full name or razón social, if this document names one.
    #[schemars(required)]
    pub business_name: Option<String>,
    /// The NIF/NIE/CIF tax identification number, if present.
    #[schemars(required)]
    pub nif: Option<String>,
    /// The fiscal address (domicilio fiscal), if present.
    #[schemars(required)]
    pub address: Option<String>,
    /// The bank name, if identifiable from the document.
    #[schemars(required)]
    pub bank_name: Option<String>,
    /// An IBAN, if one appears on the document.
    #[schemars(required)]
    pub iban: Option<String>,
    /// The date self-employment (RETA registration / fecha de inicio de actividad) began, if
    /// this document states one, normalized to ISO 8601 (YYYY-MM-DD).
    #[schemars(required)]
    pub reta_start_date: Option<String>,
    /// A 2-4 sentence Spanish summary of what this document is and establishes — fold in
    /// anything without its own field above (an activity/IAE or CNAE code, a Social Security
    /// affiliation number/NAF, a tax regime and effective date, an amount, a counterparty), so
    /// nothing meaningful is lost even when there's no dedicated field for it.
    #[schemars(required)]
    pub summary: Option<String>,
}

fn extension_of(file_path: &str) -> String {
    Path::new(file_path).extension().and_then(|e| e.to_str()).unwrap_or_default().to_lowercase()
}

fn build_extraction_preamble() -> String {
    "You are looking at a document belonging to a Spanish self-employed person (autónomo) — it \
     could be a tax/social-security registration paper (Certificado de Situación Censal, \
     Certificado I.A.E., Modelo 036, Alta en RETA, a Social Security direct-debit justificante), \
     a receipt, an invoice, a contract, or anything else business-relevant. First identify what \
     kind of document this is in a short Spanish label. Then extract, if present: the business/ \
     self-employed person's name, NIF/NIE, fiscal address, bank name and IBAN, and the \
     RETA/activity start date. Also write a short Spanish summary (2-4 sentences) of what the document \
     is and establishes, folding in anything without its own field above (an activity/IAE or \
     CNAE code, a Social Security affiliation number/NAF, a tax regime and its effective date, \
     an amount, a counterparty). Leave any field null if it cannot be determined confidently."
        .to_string()
}

#[tauri::command]
pub async fn extract_business_document_fields_cmd(
    file_path: String,
    provider: String,
    api_key: String,
    model: Option<String>,
) -> Result<RegistrationFieldsLlm, String> {
    let provider = llm::Provider::parse(&provider)?;
    let bytes = std::fs::read(&file_path).map_err(|e| e.to_string())?;
    let base64_data = base64::engine::general_purpose::STANDARD.encode(&bytes);

    let content = match extension_of(&file_path).as_str() {
        "pdf" => llm::pdf_content(base64_data),
        "png" => llm::image_content(base64_data, ImageMediaType::PNG),
        "jpg" | "jpeg" => llm::image_content(base64_data, ImageMediaType::JPEG),
        other => return Err(format!("unsupported business document file type: {other}")),
    };

    let preamble = build_extraction_preamble();
    let config = llm::ProviderConfig { provider, api_key, model };
    llm::extract(&config, &preamble, content).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extension_of_lowercases_and_strips_the_dot() {
        assert_eq!(extension_of("/tmp/Documento.PDF"), "pdf");
        assert_eq!(extension_of("/tmp/photo.JPG"), "jpg");
        assert_eq!(extension_of("/tmp/no_extension"), "");
    }

    #[test]
    fn build_extraction_preamble_covers_identification_and_every_field() {
        let preamble = build_extraction_preamble();
        assert!(preamble.contains("short Spanish label"));
        assert!(preamble.contains("NIF/NIE"));
        assert!(preamble.contains("IBAN"));
        assert!(preamble.contains("RETA"));
    }
}

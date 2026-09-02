//! Contract → billing-terms extraction. Pulls the text layer from a contract PDF (reusing
//! [`crate::receipt_extract::extract_text`]) and runs a structured LLM [`crate::llm::extract`]
//! to recover the billing amount, cadence, IRPF and IVA treatment, plus a suggested first
//! invoice-line description. The frontend (`ContratoForm`) prefills the contract's billing-
//! cadence fields from this and shows the rest as an advisory panel — nothing is auto-saved.

use std::path::Path;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::llm;
use crate::receipt_extract::lenient_f64_option;

/// Billing terms recovered from a contract PDF. Every field is `Option` and marked `required`
/// in the generated JSON schema so the model always considers it but can still answer "not
/// stated" with `null` — a miss just means nothing to prefill, not an error.
#[derive(Debug, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct ContractTermsLlm {
    /// The recurring/one-off billing amount before VAT and IRPF (the "base imponible"), as a
    /// plain number in euros. Null if the contract states no concrete amount.
    #[schemars(required)]
    #[serde(default, deserialize_with = "lenient_f64_option")]
    pub base: Option<f64>,
    /// How often the client is billed, as one of exactly: "monthly", "quarterly", "yearly",
    /// "one_off". Null if the contract does not say.
    #[schemars(required)]
    pub cadence: Option<String>,
    /// The IRPF withholding rate as a percentage (e.g. 15 or 7), or 0 / null if the contract
    /// says no retention applies (common for non-Spanish clients).
    #[schemars(required)]
    #[serde(default, deserialize_with = "lenient_f64_option")]
    pub irpf_rate: Option<f64>,
    /// The IVA treatment, as one of exactly: "standard" (ordinary 21% Spanish VAT),
    /// "reverse_charge_eu" (intra-EU B2B, inversión del sujeto pasivo), "export_outside_eu"
    /// (client outside the EU), "exempt_other" (some other exemption). Null if unclear.
    #[schemars(required)]
    pub vat_treatment: Option<String>,
    /// A short Spanish description suitable as the first invoice line's concept (e.g.
    /// "Servicios de consultoría — cuota mensual"). Null if nothing sensible can be derived.
    #[schemars(required)]
    pub description: Option<String>,
}

fn build_extraction_preamble() -> String {
    "You are reading a services contract for a Spanish self-employed person (autónomo). Extract \
     the billing terms so an invoice can be pre-filled: the billing amount (base imponible, \
     before VAT and IRPF, in euros); the billing cadence as exactly one of \"monthly\", \
     \"quarterly\", \"yearly\", or \"one_off\"; the IRPF withholding rate as a percentage \
     (e.g. 15 or 7, or 0 if the contract says no retención applies); the IVA treatment as \
     exactly one of \"standard\", \"reverse_charge_eu\", \"export_outside_eu\", or \
     \"exempt_other\"; and a short Spanish description usable as the first invoice line's \
     concept. Leave any field null if the contract does not state it clearly."
        .to_string()
}

#[tauri::command]
pub async fn extract_contract_terms_cmd(
    file_path: String,
    provider: String,
    api_key: String,
    model: Option<String>,
) -> Result<ContractTermsLlm, String> {
    let provider = llm::Provider::parse(&provider)?;
    let text = crate::receipt_extract::extract_text(Path::new(&file_path));
    if text.trim().is_empty() {
        return Err("no readable text in the contract PDF".to_string());
    }
    let config = llm::ProviderConfig { provider, api_key, model };
    llm::extract(&config, &build_extraction_preamble(), llm::text_content(text)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preamble_covers_amount_cadence_irpf_and_iva() {
        let p = build_extraction_preamble();
        assert!(p.contains("base imponible"));
        assert!(p.contains("\"monthly\""));
        assert!(p.contains("one_off"));
        assert!(p.contains("IRPF"));
        assert!(p.contains("reverse_charge_eu"));
    }

    #[test]
    fn tolerates_a_stringified_null_for_a_numeric_field() {
        // Some models emit the JSON string "null" for an optional number they leave empty
        // (seen via OpenRouter) — same failure `receipt_extract` already guards against.
        let json = r#"{"base":1200.0,"cadence":"monthly","irpf_rate":"null","vat_treatment":"standard","description":"Cuota mensual"}"#;
        let terms: ContractTermsLlm = serde_json::from_str(json).expect("tolerates stringified null");
        assert_eq!(terms.base, Some(1200.0));
        assert_eq!(terms.irpf_rate, None);
        assert_eq!(terms.cadence.as_deref(), Some("monthly"));
    }
}

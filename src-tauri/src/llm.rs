//! Generic multi-provider LLM client used by LLM-backed features (receipt extraction
//! today, future agents later). Each feature defines its own extraction struct and calls
//! [`extract`] with its own preamble/content — this module has no receipt-specific
//! knowledge.

use rig::OneOrMany;
use rig::client::AgentClientExt;
use rig::completion::Message;
use rig::completion::message::{Document, DocumentMediaType, DocumentSourceKind, Image, ImageMediaType, UserContent};
use rig::providers::{anthropic, openai, openrouter};
use schemars::JsonSchema;
use serde::Serialize;
use serde::de::DeserializeOwned;

/// Default Anthropic model when the user hasn't set one in Ajustes. Receipt/modelo extraction is
/// a "read a handful of fields" job — Haiku is far cheaper than Opus at comparable accuracy.
pub const ANTHROPIC_MODEL: &str = "claude-haiku-4-5";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Provider {
    Anthropic,
    OpenAi,
    OpenRouter,
}

impl Provider {
    pub fn parse(raw: &str) -> Result<Self, String> {
        match raw {
            "anthropic" => Ok(Self::Anthropic),
            "openai" => Ok(Self::OpenAi),
            "openrouter" => Ok(Self::OpenRouter),
            other => Err(format!("unknown LLM provider: {other}")),
        }
    }
}

/// Everything needed to reach a configured provider: which one, its API key, and the model to
/// use. `model` is optional for Anthropic/OpenAI (each has a sensible default constant) and
/// required for OpenRouter, which is a router across many vendors with no single default.
pub struct ProviderConfig {
    pub provider: Provider,
    pub api_key: String,
    pub model: Option<String>,
}

impl ProviderConfig {
    /// The user-configured model if set to something non-blank, else `default`.
    fn model_or<'a>(&'a self, default: &'a str) -> &'a str {
        self.model.as_deref().map(str::trim).filter(|m| !m.is_empty()).unwrap_or(default)
    }
}

/// Sends a single piece of multimodal user content to the configured provider and parses
/// the response into `T` via structured extraction.
pub async fn extract<T>(config: &ProviderConfig, preamble: &str, content: UserContent) -> Result<T, String>
where
    T: JsonSchema + DeserializeOwned + Serialize + Send + Sync + 'static,
{
    let message: Message = OneOrMany::one(content).into();

    match config.provider {
        Provider::Anthropic => {
            let client =
                anthropic::Client::builder().api_key(&config.api_key).build().map_err(|e| e.to_string())?;
            let extractor =
                client.extractor::<T>(config.model_or(ANTHROPIC_MODEL)).preamble(preamble).build();
            extractor.extract(message).await.map_err(|e| e.to_string())
        }
        Provider::OpenAi => {
            let client =
                openai::Client::builder().api_key(&config.api_key).build().map_err(|e| e.to_string())?;
            let extractor =
                client.extractor::<T>(config.model_or(openai::GPT_5_2)).preamble(preamble).build();
            extractor.extract(message).await.map_err(|e| e.to_string())
        }
        Provider::OpenRouter => {
            // Unlike Anthropic/OpenAI, OpenRouter has no single sensible default model — it's a
            // router across many vendors' models — so the user must configure one in Ajustes.
            let model = config
                .model
                .as_deref()
                .map(str::trim)
                .filter(|m| !m.is_empty())
                .ok_or_else(|| "no OpenRouter model configured in settings".to_string())?;
            let client =
                openrouter::Client::builder().api_key(&config.api_key).build().map_err(|e| e.to_string())?;
            let extractor = client.extractor::<T>(model).preamble(preamble).build();
            extractor.extract(message).await.map_err(|e| e.to_string())
        }
    }
}

/// Builds a base64-encoded image content block (JPEG/PNG receipt photo).
pub fn image_content(base64_data: String, media_type: ImageMediaType) -> UserContent {
    UserContent::Image(Image {
        data: DocumentSourceKind::Base64(base64_data),
        media_type: Some(media_type),
        ..Default::default()
    })
}

/// Builds a base64-encoded PDF document content block.
pub fn pdf_content(base64_data: String) -> UserContent {
    UserContent::Document(Document {
        data: DocumentSourceKind::Base64(base64_data),
        media_type: Some(DocumentMediaType::PDF),
        ..Default::default()
    })
}

/// Builds a plain text content block — used for extraction calls that synthesize from already-
/// extracted text (e.g. combining several documents' summaries) rather than reading a file.
pub fn text_content(text: String) -> UserContent {
    UserContent::text(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_parse_accepts_known_names_and_rejects_others() {
        assert_eq!(Provider::parse("anthropic"), Ok(Provider::Anthropic));
        assert_eq!(Provider::parse("openai"), Ok(Provider::OpenAi));
        assert_eq!(Provider::parse("openrouter"), Ok(Provider::OpenRouter));
        assert!(Provider::parse("bogus").is_err());
    }

    #[test]
    fn model_or_prefers_configured_model_then_falls_back_to_default() {
        let cfg = |model: Option<&str>| ProviderConfig {
            provider: Provider::Anthropic,
            api_key: "k".into(),
            model: model.map(str::to_string),
        };
        assert_eq!(cfg(Some("claude-opus-5")).model_or(ANTHROPIC_MODEL), "claude-opus-5");
        assert_eq!(cfg(Some("  ")).model_or(ANTHROPIC_MODEL), ANTHROPIC_MODEL);
        assert_eq!(cfg(None).model_or(ANTHROPIC_MODEL), ANTHROPIC_MODEL);
    }
}

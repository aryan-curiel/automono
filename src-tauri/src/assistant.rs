//! The grounded tax assistant (issue #37). The frontend builds a compact context string from the
//! user's SQLite data + `contexto_usuario.md` (all the tax math stays in `src/lib/`); this command
//! only relays that context plus the conversation to the configured LLM and returns its answer.

use rig::completion::Message;
use serde::Deserialize;

use crate::llm::{self, ProviderConfig};

/// One turn of the conversation as sent from the frontend.
#[derive(Debug, Deserialize)]
pub struct ChatMessage {
    /// `"user"` or `"assistant"`.
    pub role: String,
    pub content: String,
}

const PREAMBLE: &str = "Eres el asistente fiscal de AutoMono, una app de facturación para un \
autónomo español. Respondes preguntas sobre su situación fiscal y de negocio basándote \
EXCLUSIVAMENTE en los datos que se te dan en el contexto de abajo. No inventes cifras, fechas ni \
nombres: si un dato no aparece en el contexto, dilo con claridad. Responde en español, de forma \
breve y concreta, con los importes en euros e indicando siempre a qué periodo corresponde cada \
cifra. No das asesoramiento legal vinculante; para decisiones relevantes recomienda contrastar \
con su gestor.";

fn build_preamble(context: &str) -> String {
    format!("{PREAMBLE}\n\n---\nCONTEXTO (datos reales del usuario):\n\n{context}")
}

/// Splits the conversation into prior turns (as rig `Message`s) and the new user prompt.
fn split_turns(messages: &[ChatMessage]) -> Result<(Vec<Message>, String), String> {
    let (last, prior) = messages.split_last().ok_or("no hay ningún mensaje que responder")?;
    if last.role != "user" {
        return Err("el último mensaje debe ser del usuario".to_string());
    }
    let history = prior
        .iter()
        .map(|m| match m.role.as_str() {
            "assistant" => Message::assistant(m.content.clone()),
            _ => Message::user(m.content.clone()),
        })
        .collect();
    Ok((history, last.content.clone()))
}

#[tauri::command]
pub async fn ask_assistant_cmd(
    context: String,
    messages: Vec<ChatMessage>,
    provider: String,
    api_key: String,
    model: Option<String>,
) -> Result<String, String> {
    let provider = llm::Provider::parse(&provider)?;
    let config = ProviderConfig { provider, api_key, model };
    let (history, prompt) = split_turns(&messages)?;
    llm::chat(&config, &build_preamble(&context), history, prompt).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn msg(role: &str, content: &str) -> ChatMessage {
        ChatMessage { role: role.to_string(), content: content.to_string() }
    }

    #[test]
    fn build_preamble_keeps_the_grounding_instruction_and_embeds_the_context() {
        let p = build_preamble("Facturado 3T: 1.234 €");
        assert!(p.contains("EXCLUSIVAMENTE"));
        assert!(p.contains("No inventes"));
        assert!(p.contains("Facturado 3T: 1.234 €"));
    }

    #[test]
    fn split_turns_errors_on_empty_conversation() {
        assert!(split_turns(&[]).is_err());
    }

    #[test]
    fn split_turns_errors_when_last_turn_is_not_the_user() {
        assert!(split_turns(&[msg("user", "hola"), msg("assistant", "qué tal")]).is_err());
    }

    #[test]
    fn split_turns_returns_prior_turns_as_history_and_the_last_user_turn_as_prompt() {
        let (history, prompt) =
            split_turns(&[msg("user", "a"), msg("assistant", "b"), msg("user", "c")]).unwrap();
        assert_eq!(history.len(), 2);
        assert_eq!(prompt, "c");
    }
}

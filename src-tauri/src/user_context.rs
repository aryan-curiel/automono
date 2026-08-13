use std::path::{Path, PathBuf};

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::llm;

fn user_context_path(app: &AppHandle) -> std::io::Result<PathBuf> {
    Ok(app.path().app_data_dir().map_err(std::io::Error::other)?.join("contexto_usuario.md"))
}

/// A missing file just means "nothing generated/written yet" — returns an empty string rather
/// than an error, matching the rest of this app's "a miss is not a failure" extraction pattern.
fn read_context_file(path: &Path) -> Result<String, String> {
    match std::fs::read_to_string(path) {
        Ok(content) => Ok(content),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(e.to_string()),
    }
}

fn write_context_file(path: &Path, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn read_user_context_cmd(app: AppHandle) -> Result<String, String> {
    read_context_file(&user_context_path(&app).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn write_user_context_cmd(app: AppHandle, content: String) -> Result<(), String> {
    write_context_file(&user_context_path(&app).map_err(|e| e.to_string())?, &content)
}

#[derive(Debug, Default, Serialize, Deserialize, JsonSchema)]
struct UserContextMarkdown {
    /// The full generated markdown document.
    #[schemars(required)]
    markdown: String,
}

fn build_synthesis_preamble() -> String {
    "You are given short summaries of several documents belonging to a Spanish self-employed \
     person (autónomo). Write a single cohesive markdown document in Spanish that serves as a \
     persistent contextual memory about their business/tax situation — use headers to organize \
     it by topic (identity, tax registration, business activity, Social Security/RETA, banking, \
     other notable details), and omit a topic entirely if none of the summaries mention it. Be \
     concise but complete: every concrete fact in the summaries (names, numbers, dates, amounts) \
     should show up somewhere in the markdown."
        .to_string()
}

/// Synthesizes the per-document summaries into one cohesive markdown "memory" document. This is
/// a fresh synthesis from the given summaries each time, not an incremental append — callers
/// decide when to run it (e.g. an explicit "Regenerate" action) so a manual edit to the existing
/// context file is never silently discarded by a background process.
#[tauri::command]
pub async fn synthesize_user_context_cmd(
    summaries: Vec<String>,
    provider: String,
    api_key: String,
    model: Option<String>,
) -> Result<String, String> {
    let provider = llm::Provider::parse(&provider)?;
    let joined = summaries.join("\n\n---\n\n");
    let preamble = build_synthesis_preamble();
    let config = llm::ProviderConfig { provider, api_key, model };
    let result: UserContextMarkdown = llm::extract(&config, &preamble, llm::text_content(joined)).await?;
    Ok(result.markdown)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn read_context_file_returns_empty_string_when_missing_instead_of_erroring() {
        let tmp = std::env::temp_dir().join(format!("automono_context_missing_test_{}", std::process::id()));
        let path = tmp.join("contexto_usuario.md");
        assert_eq!(read_context_file(&path), Ok(String::new()));
    }

    #[test]
    fn write_then_read_round_trips_the_content_and_creates_parent_dirs() {
        let tmp = std::env::temp_dir().join(format!("automono_context_roundtrip_test_{}", std::process::id()));
        let path = tmp.join("nested").join("contexto_usuario.md");

        write_context_file(&path, "# Contexto\n\nHola.").expect("write succeeds");
        assert_eq!(read_context_file(&path), Ok("# Contexto\n\nHola.".to_string()));

        std::fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn build_synthesis_preamble_asks_for_spanish_markdown_organized_by_topic() {
        let preamble = build_synthesis_preamble();
        assert!(preamble.contains("markdown"));
        assert!(preamble.contains("Español") || preamble.contains("Spanish"));
        assert!(preamble.contains("RETA"));
    }
}

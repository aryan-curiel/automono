import { invoke } from "@tauri-apps/api/core";
import type { LlmProvider } from "./llmSettings";

export interface AssistantMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Asks the configured LLM a question grounded in `context` (built by
 * `buildAssistantContext`). `messages` is the full in-memory conversation, oldest first, ending
 * with the new user turn. Returns the assistant's reply text.
 */
export function askAssistant(
  context: string,
  messages: AssistantMessage[],
  provider: LlmProvider,
  apiKey: string,
  model: string | null,
): Promise<string> {
  return invoke<string>("ask_assistant_cmd", { context, messages, provider, apiKey, model });
}

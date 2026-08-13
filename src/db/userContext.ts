import { invoke } from "@tauri-apps/api/core";

/** Reads the user's markdown context file; an empty string if nothing's been written yet. */
export async function getUserContext(): Promise<string> {
  return invoke<string>("read_user_context_cmd");
}

export async function saveUserContext(content: string): Promise<void> {
  return invoke("write_user_context_cmd", { content });
}

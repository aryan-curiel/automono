import { invoke } from "@tauri-apps/api/core";
import { getDb } from "./client";

export type LlmProvider = "anthropic" | "openai" | "openrouter";

const PROVIDERS: LlmProvider[] = ["anthropic", "openai", "openrouter"];

export interface LlmSettingsRecord {
  provider: LlmProvider;
  /** Model override for Anthropic — blank uses the backend default (Haiku). */
  anthropicModel: string | null;
  /** Model override for OpenAI — blank uses the backend default. */
  openaiModel: string | null;
  /** Required for OpenRouter (no default), e.g. "anthropic/claude-sonnet-4.5". */
  openrouterModel: string | null;
}

interface LlmSettingsRow {
  provider: LlmProvider;
  anthropic_model: string | null;
  openai_model: string | null;
  openrouter_model: string | null;
  // Legacy plaintext key columns — kept in the schema, migrated to the Keychain and blanked
  // by `migratePlaintextKeys` on first load. See issue #16.
  anthropic_api_key: string | null;
  openai_api_key: string | null;
  openrouter_api_key: string | null;
}

const LEGACY_KEY_COLUMN: Record<
  LlmProvider,
  "anthropic_api_key" | "openai_api_key" | "openrouter_api_key"
> = {
  anthropic: "anthropic_api_key",
  openai: "openai_api_key",
  openrouter: "openrouter_api_key",
};

function mapRow(row: LlmSettingsRow): LlmSettingsRecord {
  return {
    provider: row.provider,
    anthropicModel: row.anthropic_model,
    openaiModel: row.openai_model,
    openrouterModel: row.openrouter_model,
  };
}

/**
 * One-time move of any API key still stored plaintext in `llm_settings` into the macOS
 * Keychain, then null the column. Idempotent — a no-op once every column is blank.
 */
async function migratePlaintextKeys(row: LlmSettingsRow): Promise<void> {
  const toBlank: string[] = [];
  for (const provider of PROVIDERS) {
    const key = row[LEGACY_KEY_COLUMN[provider]];
    if (key && key.trim() !== "") {
      await setApiKey(provider, key);
      toBlank.push(`${LEGACY_KEY_COLUMN[provider]} = NULL`);
    }
  }
  if (toBlank.length > 0) {
    const db = await getDb();
    await db.execute(`UPDATE llm_settings SET ${toBlank.join(", ")} WHERE id = 1`);
  }
}

export async function getLlmSettings(): Promise<LlmSettingsRecord> {
  const db = await getDb();
  const rows = await db.select<LlmSettingsRow[]>(
    `SELECT provider, anthropic_model, openai_model, openrouter_model,
            anthropic_api_key, openai_api_key, openrouter_api_key
     FROM llm_settings WHERE id = 1`,
  );
  await migratePlaintextKeys(rows[0]);
  return mapRow(rows[0]);
}

export async function updateLlmSettings(patch: LlmSettingsRecord): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE llm_settings
     SET provider = $1, anthropic_model = $2, openai_model = $3, openrouter_model = $4
     WHERE id = 1`,
    [patch.provider, patch.anthropicModel, patch.openaiModel, patch.openrouterModel],
  );
}

/** The API key for `provider` from the Keychain, or null if none is set. */
export function getApiKey(provider: LlmProvider): Promise<string | null> {
  return invoke<string | null>("get_llm_api_key_cmd", { provider });
}

/** Store (or, when blank/null, clear) the API key for `provider` in the Keychain. */
export function setApiKey(provider: LlmProvider, key: string | null): Promise<void> {
  return invoke("set_llm_api_key_cmd", { provider, apiKey: key ?? "" });
}

/** The API key for the currently-selected provider, or null if not configured. */
export function activeApiKey(settings: LlmSettingsRecord): Promise<string | null> {
  return getApiKey(settings.provider);
}

/** The model override for the currently-selected provider, or null to use the backend default. */
export function activeModel(settings: LlmSettingsRecord): string | null {
  switch (settings.provider) {
    case "anthropic":
      return settings.anthropicModel;
    case "openai":
      return settings.openaiModel;
    case "openrouter":
      return settings.openrouterModel;
  }
}

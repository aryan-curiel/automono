import { getDb } from "./client";

export type LlmProvider = "anthropic" | "openai" | "openrouter";

export interface LlmSettingsRecord {
  provider: LlmProvider;
  anthropicApiKey: string | null;
  openaiApiKey: string | null;
  openrouterApiKey: string | null;
  /** Only meaningful when `provider` is "openrouter" — e.g. "anthropic/claude-sonnet-4.5". */
  openrouterModel: string | null;
}

interface LlmSettingsRow {
  provider: LlmProvider;
  anthropic_api_key: string | null;
  openai_api_key: string | null;
  openrouter_api_key: string | null;
  openrouter_model: string | null;
}

function mapRow(row: LlmSettingsRow): LlmSettingsRecord {
  return {
    provider: row.provider,
    anthropicApiKey: row.anthropic_api_key,
    openaiApiKey: row.openai_api_key,
    openrouterApiKey: row.openrouter_api_key,
    openrouterModel: row.openrouter_model,
  };
}

export async function getLlmSettings(): Promise<LlmSettingsRecord> {
  const db = await getDb();
  const rows = await db.select<LlmSettingsRow[]>(
    "SELECT provider, anthropic_api_key, openai_api_key, openrouter_api_key, openrouter_model FROM llm_settings WHERE id = 1",
  );
  return mapRow(rows[0]);
}

export async function updateLlmSettings(patch: LlmSettingsRecord): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE llm_settings
     SET provider = $1, anthropic_api_key = $2, openai_api_key = $3, openrouter_api_key = $4, openrouter_model = $5
     WHERE id = 1`,
    [
      patch.provider,
      patch.anthropicApiKey,
      patch.openaiApiKey,
      patch.openrouterApiKey,
      patch.openrouterModel,
    ],
  );
}

/** The API key relevant to the currently-selected provider, or null if not configured. */
export function activeApiKey(settings: LlmSettingsRecord): string | null {
  switch (settings.provider) {
    case "anthropic":
      return settings.anthropicApiKey;
    case "openai":
      return settings.openaiApiKey;
    case "openrouter":
      return settings.openrouterApiKey;
  }
}

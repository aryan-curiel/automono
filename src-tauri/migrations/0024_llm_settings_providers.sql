ALTER TABLE llm_settings RENAME COLUMN claude_api_key TO anthropic_api_key;
ALTER TABLE llm_settings ADD COLUMN provider TEXT NOT NULL DEFAULT 'anthropic';
ALTER TABLE llm_settings ADD COLUMN openai_api_key TEXT;
ALTER TABLE llm_settings ADD COLUMN openrouter_api_key TEXT;
ALTER TABLE llm_settings ADD COLUMN openrouter_model TEXT;

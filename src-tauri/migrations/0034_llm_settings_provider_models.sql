-- Per-provider model override, mirroring the existing per-provider *_api_key columns.
-- openrouter_model already exists (0025); Anthropic/OpenAI previously had no override at all.
ALTER TABLE llm_settings ADD COLUMN anthropic_model TEXT;
ALTER TABLE llm_settings ADD COLUMN openai_model TEXT;

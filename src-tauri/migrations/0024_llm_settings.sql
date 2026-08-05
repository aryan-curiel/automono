CREATE TABLE llm_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  claude_api_key TEXT
);

INSERT INTO llm_settings (id) VALUES (1);

CREATE TABLE backup_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  folder_path TEXT NOT NULL DEFAULT '',
  retention_days INTEGER NOT NULL DEFAULT 30,
  auto_backup_enabled INTEGER NOT NULL DEFAULT 0,
  interval_days INTEGER NOT NULL DEFAULT 7,
  last_backup_at TEXT
);

INSERT INTO backup_settings (id) VALUES (1);

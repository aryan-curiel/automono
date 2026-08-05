CREATE TABLE quarterly_declarations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year INTEGER NOT NULL,
  quarter INTEGER NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  snapshot_json TEXT NOT NULL,
  modelo_303_path TEXT,
  modelo_130_path TEXT,
  modelo_111_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  UNIQUE (year, quarter)
);

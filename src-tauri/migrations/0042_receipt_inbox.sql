-- Receipt inbox: receipt files found in the watched folder (or added via quick-add) that have
-- been copied into expenses/<year>/receipts/ and run through the field extractor, but not yet
-- confirmed into the books. A queued row becomes a real `expenses` row on "Confirmar" (via the
-- normal createExpense path) and is deleted; "Descartar" deletes the row and the copied file.
-- Kept deliberately separate from `expenses` so a pending draft can never leak into any tax
-- total, declaration, or Modelo 347 summary.
CREATE TABLE receipt_inbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_file_path TEXT NOT NULL,
  source_name TEXT NOT NULL,
  extracted_date TEXT,
  extracted_amount REAL,
  extracted_iva_amount REAL,
  extracted_irpf_rate REAL,
  extracted_irpf_amount REAL,
  extracted_vendor TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Watched-folder settings. Path blank + disabled by default; opt in from Ajustes. When enabled
-- with a path set, the app sweeps the folder on launch and on window focus.
ALTER TABLE preferences ADD COLUMN receipt_inbox_path TEXT NOT NULL DEFAULT '';
ALTER TABLE preferences ADD COLUMN receipt_inbox_enabled INTEGER NOT NULL DEFAULT 0;

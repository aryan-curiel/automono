-- 0030 created business_documents keyed by a fixed doc_type before the feature was redesigned
-- into a free-form document list. Dropping and recreating is safe: this table has shipped to
-- no one, so there's no real data to preserve, only the new shape needs to exist going forward.
DROP TABLE IF EXISTS business_documents;

CREATE TABLE business_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL,
  original_name TEXT NOT NULL,
  label TEXT,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
  summary TEXT,
  extracted_json TEXT
);

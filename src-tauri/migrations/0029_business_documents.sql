-- Uploaded autónomo registration documents (Certificado Censal, IAE, Modelo 036, RETA alta,
-- domiciliación bancaria). One row per known document type — re-uploading a type replaces its
-- row and its file, since these are one-time registration proofs, not recurring receipts.
CREATE TABLE business_documents (
  doc_type TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
  summary TEXT,
  extracted_json TEXT
);

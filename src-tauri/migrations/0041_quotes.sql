-- Presupuestos / quotes (#43). Deliberately NON-fiscal: no invoice_series, no
-- invoice_number, no immutability triggers (unlike 0008_invoice_lock). A quote is
-- freely editable and deletable until it is converted into a real draft invoice.
-- Numbering is a plain per-year sequence rendered as `PRE-YYYY-NNN`.
CREATE TABLE quotes (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id            INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  year                 INTEGER NOT NULL,
  seq                  INTEGER NOT NULL,
  issue_date           TEXT NOT NULL,
  valid_until          TEXT,
  status               TEXT NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired', 'converted')),
  notes                TEXT NOT NULL DEFAULT '',
  iva_rate             REAL NOT NULL DEFAULT 21,
  irpf_rate            REAL,
  language             TEXT NOT NULL DEFAULT 'es' CHECK (language IN ('es', 'en', 'ca')),
  converted_invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
  pdf_path             TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (year, seq)
);

CREATE TABLE quote_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id    INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity    REAL NOT NULL DEFAULT 1,
  unit_price  REAL NOT NULL DEFAULT 0,
  total       REAL NOT NULL DEFAULT 0
);

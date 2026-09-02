-- Bank reconciliation (#36): imported bank-statement lines. Each row is one
-- movement from a CSV export. `dedupe_key` is a hash of the line's identifying
-- fields (value date + amount + description + reference) so re-importing the
-- same export is idempotent — the DB module inserts with INSERT OR IGNORE.
-- A line is "reconciled" once the user confirms it against an invoice, which
-- also records the payment via the existing recordPayment() path.
CREATE TABLE bank_statement_lines (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  dedupe_key        TEXT NOT NULL UNIQUE,
  value_date        TEXT NOT NULL,
  amount            REAL NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  reference         TEXT NOT NULL DEFAULT '',
  matched_invoice_id INTEGER REFERENCES invoices(id),
  reconciled_at     TEXT,
  imported_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_bank_statement_lines_unmatched
  ON bank_statement_lines (value_date)
  WHERE matched_invoice_id IS NULL;

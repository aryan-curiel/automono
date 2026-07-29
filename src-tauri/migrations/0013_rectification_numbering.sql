-- SQLite can't ALTER a UNIQUE constraint in place, so this rebuilds `invoices`
-- with is_rectification folded into the uniqueness check: without it, a
-- client's rectification #1 collides with that same client's regular
-- invoice #1 (both would store the same series_prefix/invoice_number).
PRAGMA foreign_keys=OFF;

-- Drop the invoice_lines triggers first: their WHEN clause references
-- `invoices`, and SQLite invalidates that reference the instant the table is
-- dropped below, even though it's a moment later renamed back into place.
DROP TRIGGER trg_invoice_lines_lock_after_issue_upd;
DROP TRIGGER trg_invoice_lines_lock_after_issue_ins;
DROP TRIGGER trg_invoice_lines_lock_after_issue_del;

CREATE TABLE invoices_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  series_prefix TEXT,
  invoice_number INTEGER,
  issue_date TEXT,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'paid')),
  vat_treatment TEXT CHECK (vat_treatment IN ('standard', 'reverse_charge_eu', 'export_outside_eu', 'exempt_other')),
  vat_note_text TEXT,
  language TEXT CHECK (language IN ('es', 'en', 'ca')),
  client_name_snapshot TEXT,
  client_address_snapshot TEXT,
  client_nif_snapshot TEXT,
  client_vat_number_snapshot TEXT,
  subtotal REAL,
  iva_rate REAL,
  iva_amount REAL,
  irpf_rate REAL,
  irpf_amount REAL,
  total REAL,
  pdf_path TEXT,
  is_rectification INTEGER NOT NULL DEFAULT 0 CHECK (is_rectification IN (0, 1)),
  rectifies_invoice_id INTEGER REFERENCES invoices(id) ON DELETE RESTRICT,
  rectification_reason TEXT,
  rectification_type TEXT CHECK (rectification_type IN ('full', 'partial')),
  UNIQUE (series_prefix, invoice_number, is_rectification)
);

INSERT INTO invoices_new SELECT * FROM invoices;

DROP TABLE invoices;
ALTER TABLE invoices_new RENAME TO invoices;

-- Re-create all 4 lock triggers (trg_invoices_lock_after_issue was dropped
-- automatically along with the old table; the other 3 were dropped above).
CREATE TRIGGER trg_invoices_lock_after_issue
BEFORE UPDATE ON invoices
WHEN OLD.status IN ('issued', 'paid') AND (
  NEW.status = 'draft' OR
  NEW.series_prefix IS NOT OLD.series_prefix OR
  NEW.invoice_number IS NOT OLD.invoice_number OR
  NEW.client_id IS NOT OLD.client_id OR
  NEW.issue_date IS NOT OLD.issue_date OR
  NEW.vat_treatment IS NOT OLD.vat_treatment OR
  NEW.vat_note_text IS NOT OLD.vat_note_text OR
  NEW.language IS NOT OLD.language OR
  NEW.client_name_snapshot IS NOT OLD.client_name_snapshot OR
  NEW.client_address_snapshot IS NOT OLD.client_address_snapshot OR
  NEW.client_nif_snapshot IS NOT OLD.client_nif_snapshot OR
  NEW.client_vat_number_snapshot IS NOT OLD.client_vat_number_snapshot OR
  NEW.subtotal IS NOT OLD.subtotal OR
  NEW.iva_rate IS NOT OLD.iva_rate OR
  NEW.iva_amount IS NOT OLD.iva_amount OR
  NEW.irpf_rate IS NOT OLD.irpf_rate OR
  NEW.irpf_amount IS NOT OLD.irpf_amount OR
  NEW.total IS NOT OLD.total
)
BEGIN
  SELECT RAISE(ABORT, 'issued invoices are immutable');
END;

CREATE TRIGGER trg_invoice_lines_lock_after_issue_upd
BEFORE UPDATE ON invoice_lines
WHEN (SELECT status FROM invoices WHERE id = OLD.invoice_id) IN ('issued', 'paid')
BEGIN
  SELECT RAISE(ABORT, 'cannot edit line items of an issued invoice');
END;

CREATE TRIGGER trg_invoice_lines_lock_after_issue_ins
BEFORE INSERT ON invoice_lines
WHEN (SELECT status FROM invoices WHERE id = NEW.invoice_id) IN ('issued', 'paid')
BEGIN
  SELECT RAISE(ABORT, 'cannot add line items to an issued invoice');
END;

CREATE TRIGGER trg_invoice_lines_lock_after_issue_del
BEFORE DELETE ON invoice_lines
WHEN (SELECT status FROM invoices WHERE id = OLD.invoice_id) IN ('issued', 'paid')
BEGIN
  SELECT RAISE(ABORT, 'cannot delete line items of an issued invoice');
END;

PRAGMA foreign_keys=ON;

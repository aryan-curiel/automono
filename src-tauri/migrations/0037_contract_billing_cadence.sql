-- Real recurring invoices: a billing cadence on the contract replaces the
-- "invoiced last month, not this month" heuristic. `next_invoice_date` is the
-- anchor / next-due date; it advances by one cadence interval each time an
-- invoice is auto-drafted.
ALTER TABLE contracts ADD COLUMN billing_cadence TEXT NOT NULL DEFAULT 'none'
  CHECK (billing_cadence IN ('none', 'monthly', 'quarterly', 'yearly'));
ALTER TABLE contracts ADD COLUMN next_invoice_date TEXT;

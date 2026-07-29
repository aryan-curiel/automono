CREATE TABLE clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  nif_cif TEXT NOT NULL,
  address TEXT,
  email TEXT,
  phone TEXT,
  notes TEXT,
  invoice_prefix TEXT NOT NULL UNIQUE,
  next_invoice_number INTEGER NOT NULL DEFAULT 1,
  next_rectification_number INTEGER NOT NULL DEFAULT 1,
  vat_treatment TEXT NOT NULL
    CHECK (vat_treatment IN ('standard', 'reverse_charge_eu', 'export_outside_eu', 'exempt_other')),
  invoice_language TEXT NOT NULL DEFAULT 'es'
    CHECK (invoice_language IN ('es', 'en', 'ca'))
);

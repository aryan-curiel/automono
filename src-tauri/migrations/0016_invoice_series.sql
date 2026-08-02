-- Decouples invoice numbering (prefix + counters) from clients into its own
-- `invoice_series` entity, so multiple clients (e.g. one-off/occasional
-- clients) can share a single series instead of each requiring its own.
-- SQLite can't add a NOT NULL REFERENCES column and drop columns from
-- `clients` in one ALTER, so this rebuilds the table (same approach as
-- 0013_rectification_numbering.sql used for `invoices`).
PRAGMA foreign_keys=OFF;

CREATE TABLE invoice_series (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prefix TEXT NOT NULL UNIQUE,
  next_invoice_number INTEGER NOT NULL DEFAULT 1,
  next_rectification_number INTEGER NOT NULL DEFAULT 1
);

-- One series per existing client, counters carried over exactly: zero
-- behavior change for current data.
INSERT INTO invoice_series (prefix, next_invoice_number, next_rectification_number)
SELECT invoice_prefix, next_invoice_number, next_rectification_number FROM clients;

CREATE TABLE clients_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  nif_cif TEXT NOT NULL,
  address TEXT,
  email TEXT,
  phone TEXT,
  notes TEXT,
  series_id INTEGER NOT NULL REFERENCES invoice_series(id),
  vat_treatment TEXT NOT NULL
    CHECK (vat_treatment IN ('standard', 'reverse_charge_eu', 'export_outside_eu', 'exempt_other')),
  invoice_language TEXT NOT NULL DEFAULT 'es'
    CHECK (invoice_language IN ('es', 'en', 'ca')),
  vat_number TEXT,
  country TEXT
);

INSERT INTO clients_new (id, name, nif_cif, address, email, phone, notes, series_id, vat_treatment, invoice_language, vat_number, country)
SELECT c.id, c.name, c.nif_cif, c.address, c.email, c.phone, c.notes,
       (SELECT s.id FROM invoice_series s WHERE s.prefix = c.invoice_prefix),
       c.vat_treatment, c.invoice_language, c.vat_number, c.country
FROM clients c;

DROP TABLE clients;
ALTER TABLE clients_new RENAME TO clients;

PRAGMA foreign_keys=ON;

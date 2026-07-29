CREATE TABLE business_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL DEFAULT '',
  nif_cif TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  bank_name TEXT NOT NULL DEFAULT '',
  iban TEXT NOT NULL DEFAULT '',
  bic TEXT NOT NULL DEFAULT ''
);

INSERT INTO business_profile (id) VALUES (1);

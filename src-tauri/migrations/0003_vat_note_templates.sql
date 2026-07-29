CREATE TABLE vat_note_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  treatment_code TEXT NOT NULL
    CHECK (treatment_code IN ('standard', 'reverse_charge_eu', 'export_outside_eu', 'exempt_other')),
  language TEXT NOT NULL CHECK (language IN ('es', 'en', 'ca')),
  note_text TEXT NOT NULL,
  UNIQUE (treatment_code, language)
);

INSERT INTO vat_note_templates (treatment_code, language, note_text) VALUES
  ('reverse_charge_eu', 'es', 'Operación con inversión del sujeto pasivo. Exenta de IVA según art. 25 Ley 37/1992 (entrega intracomunitaria de servicios).'),
  ('reverse_charge_eu', 'en', 'Reverse charge applies. VAT exempt under Art. 25 of Spanish VAT Law 37/1992 (intra-EU supply of services).'),
  ('export_outside_eu', 'es', 'Operación exenta de IVA por exportación de servicios fuera de la Unión Europea (art. 21 Ley 37/1992).'),
  ('export_outside_eu', 'en', 'VAT exempt — export of services outside the European Union (Art. 21, Spanish VAT Law 37/1992).');

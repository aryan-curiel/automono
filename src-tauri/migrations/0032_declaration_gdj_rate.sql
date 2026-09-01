-- Per-declaration "gastos de difícil justificación" rate (%), applied to YTD rendimiento neto
-- when computing the Modelo 130 pago fraccionado (capped €2,000/yr, enforced in TS). Régimen /
-- tax-year dependent (commonly 5%, was 7% in 2023, 2% in some cases) — the user picks it in the
-- new-declaration wizard. 5.0 is the current default; existing rows inherit it.
ALTER TABLE quarterly_declarations ADD COLUMN gdj_rate REAL NOT NULL DEFAULT 5.0;

-- Monthly Social Security self-employment quota (RETA) — a real Modelo 130 deductible expense
-- with no receipt/line item of its own, applied as a flat rate x months-in-period instead.
ALTER TABLE preferences ADD COLUMN reta_monthly_cuota REAL NOT NULL DEFAULT 80;

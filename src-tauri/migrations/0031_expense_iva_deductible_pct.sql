-- Separate deductible % for the input IVA (Modelo 303) from the general deductible % (which
-- drives the IRPF-deductible base on Modelo 130). They diverge for e.g. a mixed-use vehicle
-- (50% IVA / 0% IRPF) or home-office supplies (0% IVA / partial IRPF). NULL means "same as
-- deductible_pct" — the common case, so existing rows keep their current behaviour.
ALTER TABLE expenses ADD COLUMN iva_deductible_pct REAL;

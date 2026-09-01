-- Whether this autónomo actually files Modelo 111 (IRPF retentions practised when paying employees
-- or other professionals). A solo autónomo with no payroll normally does not — default off, so 111
-- drops out of the per-quarter declaration checklist unless the user opts in from Ajustes.
ALTER TABLE preferences ADD COLUMN presents_modelo_111 INTEGER NOT NULL DEFAULT 0;

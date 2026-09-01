-- Criterio de caja (cash-basis IVA / IRPF): when on, the quarterly declaration and the live
-- projection count only invoices already marked paid and attribute expenses by their payment
-- date. Off by default — the Spanish default is accrual (devengo). Opt in from Ajustes.
ALTER TABLE preferences ADD COLUMN criterio_caja INTEGER NOT NULL DEFAULT 0;

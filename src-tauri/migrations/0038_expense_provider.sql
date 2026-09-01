-- Counterparty (proveedor) an expense was paid to. Free text — its name is enough to group
-- expenses per provider for the Modelo 347 annual "operaciones con terceros" summary. A
-- separate provider NIF/CIF is a later refinement; the 347 view tolerates a missing one.
ALTER TABLE expenses ADD COLUMN provider TEXT;

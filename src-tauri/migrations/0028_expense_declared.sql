-- Marks an expense as already filed with Hacienda — set automatically when the quarterly
-- declaration it belongs to is completed, or toggled by hand independent of any declaration.
ALTER TABLE expenses ADD COLUMN declared INTEGER NOT NULL DEFAULT 0;

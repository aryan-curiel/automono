-- Collections / aging (#35): track how much of an invoice has been paid and
-- when the last payment landed. `amount_paid` accumulates across partial
-- payments; when it reaches `total` the app flips `status` to 'paid'.
-- Both are plain ADD COLUMN (nullable / defaulted), so no table rebuild.
-- The 0008 immutability trigger does not reference either column and already
-- permits an 'issued' -> 'paid' status change, so recording a payment on an
-- issued invoice is not blocked.
ALTER TABLE invoices ADD COLUMN amount_paid REAL NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN paid_date TEXT;

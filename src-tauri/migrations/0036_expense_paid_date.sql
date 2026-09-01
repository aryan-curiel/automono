-- Payment date of the expense (when the money actually left the account), ISO "YYYY-MM-DD".
-- Nullable: only meaningful under criterio de caja, where an expense is attributed to the
-- quarter it was paid in rather than the quarter of its `date`. Left null = fall back to `date`.
ALTER TABLE expenses ADD COLUMN paid_date TEXT;

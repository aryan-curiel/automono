-- The date self-employment (RETA registration) began — a period that only partly overlaps
-- self-employment (e.g. the quarter you registered mid-way through) only owes RETA for the
-- months from this date onward, not every month in the viewed period.
ALTER TABLE preferences ADD COLUMN reta_start_date TEXT NOT NULL DEFAULT '2026-06-01';

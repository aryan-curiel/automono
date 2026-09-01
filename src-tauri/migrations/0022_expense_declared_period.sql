-- Lets an expense be filed in a quarter other than the one its transaction date falls in
-- (e.g. a June expense declared in Q3 instead of Q2). NULL means "use the natural quarter
-- of `date`", which is the default and today's only behavior.
ALTER TABLE expenses ADD COLUMN declared_period TEXT;

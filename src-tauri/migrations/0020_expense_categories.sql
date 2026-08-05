CREATE TABLE expense_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

INSERT INTO expense_categories (name) VALUES
  ('Suministros'), ('Material'), ('Software'), ('Alquiler'), ('Transporte'), ('Otros');

-- Backfill any free-text category already used by an existing expense, so no existing
-- expense becomes invalid once the app starts treating this as a closed list.
INSERT INTO expense_categories (name)
SELECT DISTINCT TRIM(category) FROM expenses
WHERE TRIM(COALESCE(category, '')) <> ''
  AND TRIM(category) NOT IN (SELECT name FROM expense_categories);

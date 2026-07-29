CREATE TABLE expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  category TEXT,
  description TEXT,
  amount REAL NOT NULL,
  iva_amount REAL,
  deductible_pct REAL NOT NULL DEFAULT 100,
  receipt_file_path TEXT
);

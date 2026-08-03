CREATE TABLE preferences (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  theme TEXT NOT NULL DEFAULT 'light',
  language TEXT NOT NULL DEFAULT 'es',
  default_iva_rate REAL NOT NULL DEFAULT 21,
  default_irpf_rate REAL NOT NULL DEFAULT 7,
  onboarding_completed INTEGER NOT NULL DEFAULT 0
);

-- An install that already has a named business profile is an existing user upgrading, not a
-- first launch — mark onboarding done so it doesn't interrupt someone already using the app.
INSERT INTO preferences (id, onboarding_completed)
SELECT 1, CASE WHEN EXISTS (SELECT 1 FROM business_profile WHERE id = 1 AND name != '') THEN 1 ELSE 0 END;

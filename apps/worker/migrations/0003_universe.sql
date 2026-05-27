CREATE TABLE IF NOT EXISTS universe (
  symbol TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  market TEXT,
  industry TEXT,
  security_type TEXT NOT NULL CHECK (security_type IN ('stock', 'etf', 'etn', 'index', 'unknown')),
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_universe_industry
  ON universe(industry, symbol);

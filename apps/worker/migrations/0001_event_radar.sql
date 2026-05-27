CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('ptt', 'rss', 'finmind')),
  symbol TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  published_at TEXT NOT NULL,
  engagement INTEGER NOT NULL DEFAULT 0,
  tags_json TEXT NOT NULL DEFAULT '[]',
  sentiment INTEGER NOT NULL DEFAULT 3,
  reason TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_events_symbol_published
  ON events(symbol, published_at DESC);

CREATE TABLE IF NOT EXISTS candidates (
  symbol TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  score REAL NOT NULL,
  event_count INTEGER NOT NULL,
  source_count INTEGER NOT NULL,
  latest_title TEXT NOT NULL,
  latest_at TEXT NOT NULL,
  sources_json TEXT NOT NULL DEFAULT '[]',
  tags_json TEXT NOT NULL DEFAULT '[]',
  reason TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_candidates_score
  ON candidates(score DESC, latest_at DESC);

CREATE TABLE IF NOT EXISTS watchlist (
  symbol TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  added_at TEXT NOT NULL
);

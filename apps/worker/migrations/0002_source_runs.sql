CREATE TABLE IF NOT EXISTS source_runs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('ptt', 'rss', 'finmind')),
  status TEXT NOT NULL CHECK (status IN ('ok', 'partial', 'failed')),
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  item_count INTEGER NOT NULL DEFAULT 0,
  message TEXT
);

CREATE INDEX IF NOT EXISTS idx_source_runs_started
  ON source_runs(started_at DESC);

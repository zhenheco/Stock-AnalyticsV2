CREATE TABLE events_next (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('ptt', 'rss', 'finmind', 'twse', 'mops')),
  symbol TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  published_at TEXT NOT NULL,
  engagement INTEGER NOT NULL DEFAULT 0,
  tags_json TEXT NOT NULL DEFAULT '[]',
  sentiment INTEGER NOT NULL DEFAULT 3,
  reason TEXT NOT NULL DEFAULT '',
  confidence_score INTEGER NOT NULL DEFAULT 50
);

INSERT INTO events_next
  (id, source, symbol, title, url, published_at, engagement, tags_json, sentiment, reason, confidence_score)
SELECT
  id, source, symbol, title, url, published_at, engagement, tags_json, sentiment, reason, 50
FROM events;

DROP TABLE events;
ALTER TABLE events_next RENAME TO events;

CREATE INDEX IF NOT EXISTS idx_events_symbol_published
  ON events(symbol, published_at DESC);

CREATE TABLE source_runs_next (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('ptt', 'rss', 'finmind', 'twse', 'mops')),
  status TEXT NOT NULL CHECK (status IN ('ok', 'partial', 'failed')),
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  item_count INTEGER NOT NULL DEFAULT 0,
  message TEXT
);

INSERT INTO source_runs_next
  (id, source, status, started_at, finished_at, item_count, message)
SELECT
  id, source, status, started_at, finished_at, item_count, message
FROM source_runs;

DROP TABLE source_runs;
ALTER TABLE source_runs_next RENAME TO source_runs;

CREATE INDEX IF NOT EXISTS idx_source_runs_started
  ON source_runs(started_at DESC);

ALTER TABLE candidates ADD COLUMN score_breakdown_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE candidates ADD COLUMN confidence_score INTEGER NOT NULL DEFAULT 0;

ALTER TABLE watchlist ADD COLUMN note TEXT NOT NULL DEFAULT '';
ALTER TABLE watchlist ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE watchlist ADD COLUMN alert_threshold REAL;
ALTER TABLE watchlist ADD COLUMN last_seen_event_at TEXT;

CREATE TABLE IF NOT EXISTS daily_snapshots (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  candidate_count INTEGER NOT NULL DEFAULT 0,
  top_symbols_json TEXT NOT NULL DEFAULT '[]',
  scores_json TEXT NOT NULL DEFAULT '{}',
  source_status_counts_json TEXT NOT NULL DEFAULT '{}',
  drift_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_daily_snapshots_created
  ON daily_snapshots(created_at DESC);

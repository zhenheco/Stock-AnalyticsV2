CREATE TABLE events_next (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('ptt', 'rss', 'finmind', 'twse')),
  symbol TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  published_at TEXT NOT NULL,
  engagement INTEGER NOT NULL DEFAULT 0,
  tags_json TEXT NOT NULL DEFAULT '[]',
  sentiment INTEGER NOT NULL DEFAULT 3,
  reason TEXT NOT NULL DEFAULT ''
);

INSERT INTO events_next
  (id, source, symbol, title, url, published_at, engagement, tags_json, sentiment, reason)
SELECT
  id, source, symbol, title, url, published_at, engagement, tags_json, sentiment, reason
FROM events;

DROP TABLE events;
ALTER TABLE events_next RENAME TO events;

CREATE INDEX IF NOT EXISTS idx_events_symbol_published
  ON events(symbol, published_at DESC);

CREATE TABLE source_runs_next (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('ptt', 'rss', 'finmind', 'twse')),
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

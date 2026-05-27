ALTER TABLE candidates
  ADD COLUMN source_counts_json TEXT NOT NULL DEFAULT '{}';

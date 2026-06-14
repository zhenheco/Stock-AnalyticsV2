import type { Candidate, DailySnapshot, EventRecord, FinMindMetrics, ScoreBreakdown, SourceKind, SourceRun, SourceRunStatus, UniverseStock, WatchlistEntry } from "@stock-analytics/shared";
import type { Repository } from "./types";

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<T[]>;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = unknown>(): Promise<{ results?: T[] }>;
  run(): Promise<unknown>;
}

export class D1Repository implements Repository {
  constructor(private readonly db: D1Database) {}

  async listCandidates(): Promise<Candidate[]> {
    const rows = await this.db.prepare("SELECT * FROM candidates ORDER BY score DESC, latest_at DESC LIMIT 100").all<CandidateRow>();
    return (rows.results ?? []).map(rowToCandidate);
  }

  async saveCandidates(candidates: Candidate[]): Promise<void> {
    await this.db.prepare("DELETE FROM candidates").run();
    if (candidates.length === 0) {
      return;
    }

    await batchStatements(this.db, candidates.map((candidate) => this.db.prepare(`
      INSERT OR REPLACE INTO candidates
        (symbol, name, score, event_count, source_count, source_counts_json, latest_title, latest_at, sources_json, tags_json, reason, score_breakdown_json, confidence_score)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      candidate.symbol,
      candidate.name,
      candidate.score,
      candidate.eventCount,
      candidate.sourceCount,
      JSON.stringify(candidate.sourceEventCounts ?? {}),
      candidate.latestTitle,
      candidate.latestAt,
      JSON.stringify(candidate.sources),
      JSON.stringify(candidate.tags),
      candidate.reason,
      JSON.stringify(candidate.scoreBreakdown ?? {}),
      candidate.confidenceScore ?? 0
    )));
  }

  async listEvents(): Promise<EventRecord[]> {
    const rows = await this.db.prepare("SELECT * FROM events ORDER BY published_at DESC LIMIT 1000").all<EventRow>();
    return (rows.results ?? []).map(rowToEvent);
  }

  async listEventsForSymbol(symbol: string): Promise<EventRecord[]> {
    const rows = await this.db.prepare("SELECT * FROM events WHERE symbol = ? ORDER BY published_at DESC LIMIT 100")
      .bind(symbol)
      .all<EventRow>();
    return (rows.results ?? []).map(rowToEvent);
  }

  async saveEvents(events: EventRecord[]): Promise<void> {
    await batchStatements(this.db, events.map((event) => this.db.prepare(`
      INSERT OR REPLACE INTO events
        (id, source, symbol, title, url, published_at, engagement, tags_json, sentiment, reason, confidence_score, metrics_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      event.id,
      event.source,
      event.symbol,
      event.title,
      event.url,
      event.publishedAt,
      event.engagement,
      JSON.stringify(event.tags),
      event.sentiment,
      event.reason,
      event.confidenceScore ?? 50,
      event.metrics ? JSON.stringify(event.metrics) : null
    )));
  }

  async replaceEvents(events: EventRecord[]): Promise<void> {
    await this.db.prepare("DELETE FROM events").run();
    await this.saveEvents(events);
  }

  async listUniverse(limit?: number): Promise<UniverseStock[]> {
    const query = typeof limit === "number"
      ? this.db.prepare("SELECT * FROM universe ORDER BY symbol LIMIT ?").bind(limit)
      : this.db.prepare("SELECT * FROM universe ORDER BY symbol");
    const rows = await query.all<UniverseRow>();
    return (rows.results ?? []).map(rowToUniverseStock);
  }

  async countUniverse(): Promise<number> {
    const rows = await this.db.prepare("SELECT COUNT(*) AS count FROM universe").all<{ count: number }>();
    return rows.results?.[0]?.count ?? 0;
  }

  async upsertUniverse(stocks: UniverseStock[]): Promise<void> {
    if (stocks.length === 0) {
      return;
    }

    await batchStatements(this.db, stocks.map((stock) => this.db.prepare(`
      INSERT OR REPLACE INTO universe
        (symbol, name, market, industry, security_type, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      stock.symbol,
      stock.name,
      stock.market ?? null,
      stock.industry ?? null,
      stock.securityType,
      stock.updatedAt
    )));
  }

  async listSourceRuns(): Promise<SourceRun[]> {
    const rows = await this.db.prepare("SELECT * FROM source_runs ORDER BY started_at DESC LIMIT 50").all<SourceRunRow>();
    return (rows.results ?? []).map((row) => ({
      id: row.id,
      source: row.source,
      status: row.status,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      itemCount: row.item_count,
      ...(row.message ? { message: row.message } : {})
    }));
  }

  async saveSourceRuns(runs: SourceRun[]): Promise<void> {
    await batchStatements(this.db, runs.map((run) => this.db.prepare(`
      INSERT OR REPLACE INTO source_runs
        (id, source, status, started_at, finished_at, item_count, message)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      run.id,
      run.source,
      run.status,
      run.startedAt,
      run.finishedAt,
      run.itemCount,
      run.message ?? null
    )));
  }

  async listWatchlist(): Promise<WatchlistEntry[]> {
    const rows = await this.db.prepare("SELECT symbol, name, added_at, note, tags_json, alert_threshold, last_seen_event_at FROM watchlist ORDER BY symbol").all<WatchlistRow>();
    return (rows.results ?? []).map(rowToWatchlistEntry);
  }

  async addWatchlist(entry: Omit<WatchlistEntry, "addedAt">): Promise<WatchlistEntry> {
    const existing = await this.db.prepare("SELECT symbol, name, added_at, note, tags_json, alert_threshold, last_seen_event_at FROM watchlist WHERE symbol = ?")
      .bind(entry.symbol)
      .all<WatchlistRow>();
    if (existing.results?.[0]) {
      return rowToWatchlistEntry(existing.results[0]);
    }

    const addedAt = new Date().toISOString();
    await this.db.prepare("INSERT OR IGNORE INTO watchlist (symbol, name, added_at, note, tags_json, alert_threshold, last_seen_event_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(entry.symbol, entry.name, addedAt, entry.note ?? "", JSON.stringify(entry.tags ?? []), entry.alertThreshold ?? null, entry.lastSeenEventAt ?? null)
      .run();
    return { ...entry, addedAt };
  }

  async removeWatchlist(symbol: string): Promise<boolean> {
    const existing = await this.db.prepare("SELECT symbol FROM watchlist WHERE symbol = ?")
      .bind(symbol)
      .all<{ symbol: string }>();
    await this.db.prepare("DELETE FROM watchlist WHERE symbol = ?")
      .bind(symbol)
      .run();
    return Boolean(existing.results?.length);
  }

  async listSnapshots(limit = 14): Promise<DailySnapshot[]> {
    const rows = await this.db.prepare("SELECT * FROM daily_snapshots ORDER BY created_at DESC LIMIT ?")
      .bind(limit)
      .all<DailySnapshotRow>();
    return (rows.results ?? []).map(rowToDailySnapshot);
  }

  async saveSnapshot(snapshot: DailySnapshot): Promise<void> {
    await this.db.prepare(`
      INSERT OR REPLACE INTO daily_snapshots
        (id, created_at, candidate_count, top_symbols_json, scores_json, source_status_counts_json, drift_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      snapshot.id,
      snapshot.createdAt,
      snapshot.candidateCount,
      JSON.stringify(snapshot.topSymbols),
      JSON.stringify(snapshot.scores ?? {}),
      JSON.stringify(snapshot.sourceStatusCounts),
      JSON.stringify(snapshot.drift)
    ).run();
  }
}

function rowToWatchlistEntry(row: WatchlistRow): WatchlistEntry {
  const tags = parseJsonArray(row.tags_json);
  return {
    symbol: row.symbol,
    name: row.name,
    addedAt: row.added_at,
    ...(row.note ? { note: row.note } : {}),
    ...(tags.length > 0 ? { tags } : {}),
    ...(typeof row.alert_threshold === "number" ? { alertThreshold: row.alert_threshold } : {}),
    ...(row.last_seen_event_at ? { lastSeenEventAt: row.last_seen_event_at } : {})
  };
}

interface CandidateRow {
  symbol: string;
  name: string;
  score: number;
  event_count: number;
  source_count: number;
  source_counts_json?: string;
  latest_title: string;
  latest_at: string;
  sources_json: string;
  tags_json: string;
  reason: string;
  score_breakdown_json?: string;
  confidence_score?: number;
}

interface EventRow {
  id: string;
  source: SourceKind;
  symbol: string;
  title: string;
  url: string;
  published_at: string;
  engagement: number;
  tags_json: string;
  sentiment: number;
  reason: string;
  confidence_score?: number;
  metrics_json?: string | null;
}

interface WatchlistRow {
  symbol: string;
  name: string;
  added_at: string;
  note?: string | null;
  tags_json?: string | null;
  alert_threshold?: number | null;
  last_seen_event_at?: string | null;
}

interface SourceRunRow {
  id: string;
  source: SourceKind;
  status: SourceRunStatus;
  started_at: string;
  finished_at: string;
  item_count: number;
  message: string | null;
}

interface UniverseRow {
  symbol: string;
  name: string;
  market: string | null;
  industry: string | null;
  security_type: UniverseStock["securityType"];
  updated_at: string;
}

interface DailySnapshotRow {
  id: string;
  created_at: string;
  candidate_count: number;
  top_symbols_json: string;
  scores_json?: string;
  source_status_counts_json: string;
  drift_json: string;
}

function rowToCandidate(row: CandidateRow): Candidate {
  return {
    symbol: row.symbol,
    name: row.name,
    score: row.score,
    eventCount: row.event_count,
    sourceCount: row.source_count,
    sourceEventCounts: parseSourceEventCounts(row.source_counts_json, row.sources_json, row.event_count),
    latestTitle: row.latest_title,
    latestAt: row.latest_at,
    sources: JSON.parse(row.sources_json) as SourceKind[],
    tags: JSON.parse(row.tags_json) as string[],
    reason: row.reason,
    scoreBreakdown: parseScoreBreakdown(row.score_breakdown_json),
    confidenceScore: row.confidence_score ?? undefined
  };
}

function parseSourceEventCounts(sourceCountsJson: string | undefined, sourcesJson: string, eventCount: number): Partial<Record<SourceKind, number>> {
  if (sourceCountsJson) {
    try {
      return JSON.parse(sourceCountsJson) as Partial<Record<SourceKind, number>>;
    } catch {
      return {};
    }
  }

  try {
    const sources = JSON.parse(sourcesJson) as SourceKind[];
    const firstSource = sources[0];
    if (sources.length === 1 && firstSource) {
      return { [firstSource]: eventCount };
    }
    return Object.fromEntries(sources.map((source) => [source, 1])) as Partial<Record<SourceKind, number>>;
  } catch {
    return {};
  }
}

function rowToEvent(row: EventRow): EventRecord {
  const metrics = parseFinMindMetrics(row.metrics_json);
  return {
    id: row.id,
    source: row.source,
    symbol: row.symbol,
    title: row.title,
    url: row.url,
    publishedAt: row.published_at,
    engagement: row.engagement,
    tags: JSON.parse(row.tags_json) as string[],
    sentiment: row.sentiment,
    reason: row.reason,
    confidenceScore: row.confidence_score ?? undefined,
    ...(metrics ? { metrics } : {})
  };
}

function rowToDailySnapshot(row: DailySnapshotRow): DailySnapshot {
  return {
    id: row.id,
    createdAt: row.created_at,
    candidateCount: row.candidate_count,
    topSymbols: parseJsonArray(row.top_symbols_json),
    scores: parseNumberRecord(row.scores_json),
    sourceStatusCounts: parseJsonObject(row.source_status_counts_json) as DailySnapshot["sourceStatusCounts"],
    drift: parseJsonObject(row.drift_json) as DailySnapshot["drift"]
  };
}

function rowToUniverseStock(row: UniverseRow): UniverseStock {
  return {
    symbol: row.symbol,
    name: row.name,
    ...(row.market ? { market: row.market } : {}),
    ...(row.industry ? { industry: row.industry } : {}),
    securityType: row.security_type,
    updatedAt: row.updated_at
  };
}

async function batchStatements(db: D1Database, statements: D1PreparedStatement[], size = 100): Promise<void> {
  for (let index = 0; index < statements.length; index += size) {
    await db.batch(statements.slice(index, index + size));
  }
}

function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value: string | null | undefined): Record<string, unknown> {
  if (!value) {
    return {};
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function parseScoreBreakdown(value: string | null | undefined): ScoreBreakdown | undefined {
  const parsed = parseJsonObject(value);
  return Object.keys(parsed).length > 0 ? parsed as unknown as ScoreBreakdown : undefined;
}

function parseFinMindMetrics(value: string | null | undefined): FinMindMetrics | undefined {
  const parsed = parseJsonObject(value);
  return Object.keys(parsed).length > 0 ? parsed as unknown as FinMindMetrics : undefined;
}

function parseNumberRecord(value: string | null | undefined): Record<string, number> {
  const parsed = parseJsonObject(value);
  return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, number] => typeof entry[1] === "number"));
}

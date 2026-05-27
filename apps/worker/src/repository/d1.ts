import type { Candidate, EventRecord, SourceKind, WatchlistEntry } from "@stock-analytics/shared";
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
    await this.db.batch(candidates.map((candidate) => this.db.prepare(`
      INSERT OR REPLACE INTO candidates
        (symbol, name, score, event_count, source_count, latest_title, latest_at, sources_json, tags_json, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      candidate.symbol,
      candidate.name,
      candidate.score,
      candidate.eventCount,
      candidate.sourceCount,
      candidate.latestTitle,
      candidate.latestAt,
      JSON.stringify(candidate.sources),
      JSON.stringify(candidate.tags),
      candidate.reason
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
    await this.db.batch(events.map((event) => this.db.prepare(`
      INSERT OR REPLACE INTO events
        (id, source, symbol, title, url, published_at, engagement, tags_json, sentiment, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      event.reason
    )));
  }

  async listWatchlist(): Promise<WatchlistEntry[]> {
    const rows = await this.db.prepare("SELECT symbol, name, added_at FROM watchlist ORDER BY symbol").all<WatchlistRow>();
    return (rows.results ?? []).map((row) => ({ symbol: row.symbol, name: row.name, addedAt: row.added_at }));
  }

  async addWatchlist(entry: Omit<WatchlistEntry, "addedAt">): Promise<WatchlistEntry> {
    const addedAt = new Date().toISOString();
    await this.db.prepare("INSERT OR IGNORE INTO watchlist (symbol, name, added_at) VALUES (?, ?, ?)")
      .bind(entry.symbol, entry.name, addedAt)
      .run();
    return { ...entry, addedAt };
  }
}

interface CandidateRow {
  symbol: string;
  name: string;
  score: number;
  event_count: number;
  source_count: number;
  latest_title: string;
  latest_at: string;
  sources_json: string;
  tags_json: string;
  reason: string;
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
}

interface WatchlistRow {
  symbol: string;
  name: string;
  added_at: string;
}

function rowToCandidate(row: CandidateRow): Candidate {
  return {
    symbol: row.symbol,
    name: row.name,
    score: row.score,
    eventCount: row.event_count,
    sourceCount: row.source_count,
    latestTitle: row.latest_title,
    latestAt: row.latest_at,
    sources: JSON.parse(row.sources_json) as SourceKind[],
    tags: JSON.parse(row.tags_json) as string[],
    reason: row.reason
  };
}

function rowToEvent(row: EventRow): EventRecord {
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
    reason: row.reason
  };
}

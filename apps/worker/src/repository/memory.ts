import type { Candidate, EventRecord, SourceRun, UniverseStock, WatchlistEntry } from "@stock-analytics/shared";
import type { Repository } from "./types";

export class MemoryRepository implements Repository {
  private candidates: Candidate[] = [];
  private events: EventRecord[] = [];
  private universe: UniverseStock[] = [];
  private sourceRuns: SourceRun[] = [];
  private watchlist: WatchlistEntry[] = [];

  async listCandidates(): Promise<Candidate[]> {
    return [...this.candidates];
  }

  async saveCandidates(candidates: Candidate[]): Promise<void> {
    this.candidates = [...candidates];
  }

  async listEvents(): Promise<EventRecord[]> {
    return [...this.events].sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
  }

  async listEventsForSymbol(symbol: string): Promise<EventRecord[]> {
    return this.events
      .filter((event) => event.symbol === symbol)
      .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
  }

  async saveEvents(events: EventRecord[]): Promise<void> {
    const byId = new Map(this.events.map((event) => [event.id, event]));
    for (const event of events) {
      byId.set(event.id, event);
    }
    this.events = [...byId.values()];
  }

  async listUniverse(limit?: number): Promise<UniverseStock[]> {
    const stocks = [...this.universe].sort((left, right) => left.symbol.localeCompare(right.symbol));
    return typeof limit === "number" ? stocks.slice(0, limit) : stocks;
  }

  async countUniverse(): Promise<number> {
    return this.universe.length;
  }

  async upsertUniverse(stocks: UniverseStock[]): Promise<void> {
    const bySymbol = new Map(this.universe.map((stock) => [stock.symbol, stock]));
    for (const stock of stocks) {
      bySymbol.set(stock.symbol, stock);
    }
    this.universe = [...bySymbol.values()];
  }

  async listSourceRuns(): Promise<SourceRun[]> {
    return [...this.sourceRuns].sort((left, right) => right.startedAt.localeCompare(left.startedAt)).slice(0, 50);
  }

  async saveSourceRuns(runs: SourceRun[]): Promise<void> {
    const byId = new Map(this.sourceRuns.map((run) => [run.id, run]));
    for (const run of runs) {
      byId.set(run.id, run);
    }
    this.sourceRuns = [...byId.values()];
  }

  async listWatchlist(): Promise<WatchlistEntry[]> {
    return [...this.watchlist].sort((left, right) => left.symbol.localeCompare(right.symbol));
  }

  async addWatchlist(entry: Omit<WatchlistEntry, "addedAt">): Promise<WatchlistEntry> {
    const existing = this.watchlist.find((item) => item.symbol === entry.symbol);
    if (existing) {
      return existing;
    }

    const created = { ...entry, addedAt: new Date().toISOString() };
    this.watchlist.push(created);
    return created;
  }
}

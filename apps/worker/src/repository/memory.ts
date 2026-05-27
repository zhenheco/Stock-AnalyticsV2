import type { Candidate, EventRecord, WatchlistEntry } from "@stock-analytics/shared";
import type { Repository } from "./types";

export class MemoryRepository implements Repository {
  private candidates: Candidate[] = [];
  private events: EventRecord[] = [];
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

import type { Candidate, DailySnapshot, EventRecord, SourceRun, UniverseStock, WatchlistEntry } from "@stock-analytics/shared";

export interface Repository {
  listCandidates(): Promise<Candidate[]>;
  saveCandidates(candidates: Candidate[]): Promise<void>;
  listEvents(): Promise<EventRecord[]>;
  listEventsForSymbol(symbol: string): Promise<EventRecord[]>;
  saveEvents(events: EventRecord[]): Promise<void>;
  replaceEvents(events: EventRecord[]): Promise<void>;
  listUniverse(limit?: number): Promise<UniverseStock[]>;
  countUniverse(): Promise<number>;
  upsertUniverse(stocks: UniverseStock[]): Promise<void>;
  listSourceRuns(): Promise<SourceRun[]>;
  saveSourceRuns(runs: SourceRun[]): Promise<void>;
  listWatchlist(): Promise<WatchlistEntry[]>;
  addWatchlist(entry: Omit<WatchlistEntry, "addedAt">): Promise<WatchlistEntry>;
  removeWatchlist(symbol: string): Promise<boolean>;
  listSnapshots(limit?: number): Promise<DailySnapshot[]>;
  saveSnapshot(snapshot: DailySnapshot): Promise<void>;
}

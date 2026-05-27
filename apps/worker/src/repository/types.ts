import type { Candidate, EventRecord, SourceRun, WatchlistEntry } from "@stock-analytics/shared";

export interface Repository {
  listCandidates(): Promise<Candidate[]>;
  saveCandidates(candidates: Candidate[]): Promise<void>;
  listEvents(): Promise<EventRecord[]>;
  listEventsForSymbol(symbol: string): Promise<EventRecord[]>;
  saveEvents(events: EventRecord[]): Promise<void>;
  listSourceRuns(): Promise<SourceRun[]>;
  saveSourceRuns(runs: SourceRun[]): Promise<void>;
  listWatchlist(): Promise<WatchlistEntry[]>;
  addWatchlist(entry: Omit<WatchlistEntry, "addedAt">): Promise<WatchlistEntry>;
}

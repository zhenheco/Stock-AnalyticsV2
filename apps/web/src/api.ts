import type { Candidate, EventRecord, WatchlistEntry } from "@stock-analytics/shared";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export interface CandidateResponse {
  candidates: Candidate[];
  updatedAt: string | null;
}

export interface StockResearchResponse {
  symbol: string;
  events: EventRecord[];
}

export async function fetchCandidates(): Promise<CandidateResponse> {
  return fetchJson<CandidateResponse>("/api/candidates");
}

export async function fetchStockResearch(symbol: string): Promise<StockResearchResponse> {
  return fetchJson<StockResearchResponse>(`/api/stocks/${encodeURIComponent(symbol)}/research`);
}

export async function fetchWatchlist(): Promise<{ watchlist: WatchlistEntry[] }> {
  return fetchJson<{ watchlist: WatchlistEntry[] }>("/api/watchlist");
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return await response.json() as T;
}

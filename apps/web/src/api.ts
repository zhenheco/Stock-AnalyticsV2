import type { Candidate, EventRecord, SourceRun, WatchlistEntry } from "@stock-analytics/shared";

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

export async function addWatchlistEntry(input: { symbol: string; name: string; adminToken: string }): Promise<WatchlistEntry> {
  return fetchJson<WatchlistEntry>("/api/watchlist", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-admin-token": input.adminToken
    },
    body: JSON.stringify({ symbol: input.symbol, name: input.name })
  });
}

export async function fetchSourceRuns(): Promise<{ runs: SourceRun[] }> {
  return fetchJson<{ runs: SourceRun[] }>("/api/source-runs");
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return await response.json() as T;
}

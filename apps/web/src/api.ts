import type { Candidate, DataReadiness, EventRecord, SourceRun, UniverseStock, WatchlistEntry } from "@stock-analytics/shared";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export interface CandidateResponse {
  candidates: Candidate[];
  updatedAt: string | null;
}

export interface StockResearchResponse {
  symbol: string;
  stock: UniverseStock | null;
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

export async function addWatchlistEntry(input: { symbol: string; name?: string; adminToken: string }): Promise<WatchlistEntry> {
  return fetchJson<WatchlistEntry>("/api/watchlist", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-admin-token": input.adminToken
    },
    body: JSON.stringify({
      symbol: input.symbol,
      ...(input.name?.trim() ? { name: input.name.trim() } : {})
    })
  });
}

export async function removeWatchlistEntry(input: { symbol: string; adminToken: string }): Promise<{ removed: boolean }> {
  return fetchJson<{ removed: boolean }>(`/api/watchlist/${encodeURIComponent(input.symbol)}`, {
    method: "DELETE",
    headers: {
      "x-admin-token": input.adminToken
    }
  });
}

export async function fetchSourceRuns(): Promise<{ runs: SourceRun[] }> {
  return fetchJson<{ runs: SourceRun[] }>("/api/source-runs");
}

export async function fetchDataReadiness(): Promise<DataReadiness> {
  return fetchJson<DataReadiness>("/api/data-readiness");
}

export async function fetchUniverse(): Promise<{ stocks: UniverseStock[]; count: number }> {
  return fetchJson<{ stocks: UniverseStock[]; count: number }>("/api/universe?limit=0");
}

export async function triggerAdminIngest(adminToken: string): Promise<{ candidateCount: number }> {
  return fetchJson<{ candidateCount: number }>("/api/admin/run-ingest", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-admin-token": adminToken
    },
    body: "{}"
  });
}

export async function triggerAdminScore(adminToken: string): Promise<{ candidateCount: number }> {
  return fetchJson<{ candidateCount: number }>("/api/admin/run-score", {
    method: "POST",
    headers: {
      "x-admin-token": adminToken
    }
  });
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return await response.json() as T;
}

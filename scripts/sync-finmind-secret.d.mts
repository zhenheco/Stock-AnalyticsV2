export function formatTokenPresence(token: string): string;

export interface ReadinessLike {
  status: string;
  counts: {
    candidates: number;
    universe: number;
    watchlist: number;
  };
  checks: Array<{
    id: string;
    status: string;
    message: string;
  }>;
}

export function summarizeReadiness(readiness: ReadinessLike): string;

export interface ProductionSmokeInput {
  ingest: {
    candidateCount?: number;
  };
  readiness: {
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
  };
  sourceRuns: {
    runs: Array<{
      source: "ptt" | "rss" | "twse" | "mops" | "finmind";
      status: "ok" | "partial" | "failed";
      startedAt?: string;
      itemCount: number;
    }>;
  };
  candidates: {
    updatedAt?: string | null;
    candidates: Array<{
      symbol: string;
      name: string;
      sourceEventCounts?: Partial<Record<"finmind" | "rss" | "ptt" | "twse" | "mops", number>>;
    }>;
  };
}

export function summarizeProductionSmoke(input: ProductionSmokeInput): string[];

export function productionSmokeGate(input: ProductionSmokeInput): {
  ok: boolean;
  reasons: string[];
};

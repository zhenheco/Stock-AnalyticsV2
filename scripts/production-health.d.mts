export interface ProductionHealthInput {
  page: {
    status: number;
    html: string;
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
  candidates: {
    updatedAt?: string | null;
    candidates: Array<{
      symbol: string;
      name: string;
      sourceEventCounts?: Partial<Record<"finmind" | "rss" | "ptt", number>>;
    }>;
  };
  finmindToken: string;
}

export function summarizeProductionHealth(input: ProductionHealthInput): string[];

export function productionHealthGate(input: ProductionHealthInput): {
  ok: boolean;
  reasons: string[];
};

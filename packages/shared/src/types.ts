export type SourceKind = "ptt" | "rss" | "finmind" | "twse" | "mops";
export type SourceRunStatus = "ok" | "partial" | "failed";

export interface SourceEvent {
  source: SourceKind;
  title: string;
  url: string;
  publishedAt: string;
  engagement: number;
  symbols: string[];
}

export interface EventRecord {
  id: string;
  source: SourceKind;
  symbol: string;
  title: string;
  url: string;
  publishedAt: string;
  engagement: number;
  tags: string[];
  sentiment: number;
  reason: string;
  confidenceScore?: number;
}

export interface ScoreBreakdown {
  eventStrength: number;
  sourceConfidence: number;
  freshness: number;
  crossSourceBoost: number;
  watchlistBoost: number;
}

export interface Candidate {
  symbol: string;
  name: string;
  score: number;
  eventCount: number;
  sourceCount: number;
  sourceEventCounts?: Partial<Record<SourceKind, number>>;
  latestTitle: string;
  latestAt: string;
  sources: SourceKind[];
  tags: string[];
  reason: string;
  scoreBreakdown?: ScoreBreakdown;
  confidenceScore?: number;
}

export interface WatchlistEntry {
  symbol: string;
  name: string;
  addedAt: string;
  note?: string;
  tags?: string[];
  alertThreshold?: number;
  lastSeenEventAt?: string | null;
}

export type SecurityType = "stock" | "etf" | "etn" | "index" | "unknown";

export interface UniverseStock {
  symbol: string;
  name: string;
  market?: string;
  industry?: string;
  securityType: SecurityType;
  updatedAt: string;
}

export interface SourceRun {
  id: string;
  source: SourceKind;
  status: SourceRunStatus;
  startedAt: string;
  finishedAt: string;
  itemCount: number;
  message?: string;
}

export type ReadinessStatus = "ready" | "degraded" | "missing";

export interface ReadinessCheck {
  id: string;
  label: string;
  status: ReadinessStatus;
  message: string;
}

export interface DataReadiness {
  status: ReadinessStatus;
  updatedAt: string | null;
  counts: {
    candidates: number;
    universe: number;
    watchlist: number;
  };
  checks: ReadinessCheck[];
}

export interface LlmClassification {
  sentiment: number;
  tags: string[];
  reason: string;
}

export interface FinMindRow {
  stock_id: string;
  stock_name?: string;
  date?: string;
  name?: string;
  buy?: number;
  sell?: number;
  Return?: number;
  TodayBalance?: number;
  YesBalance?: number;
  close?: number;
  Trading_Volume?: number;
  revenue?: number;
  revenue_month?: number;
  revenue_year?: number;
}

export interface FinMindStockInfoRow {
  stock_id: string;
  stock_name?: string;
  market_category?: string;
  industry_category?: string;
  type?: string;
}

export interface TwseNewsRow {
  Title?: string;
  Url?: string;
  Date?: string;
}

export interface MopsMaterialInfoRow {
  companyId?: string;
  companyName?: string;
  title?: string;
  url?: string;
  date?: string;
  time?: string;
}

export interface DailySnapshot {
  id: string;
  createdAt: string;
  candidateCount: number;
  topSymbols: string[];
  scores?: Record<string, number>;
  sourceStatusCounts: Record<SourceRunStatus, number>;
  drift: {
    newSymbols: string[];
    droppedSymbols: string[];
    scoreChanges: Array<{
      symbol: string;
      from: number;
      to: number;
      delta: number;
    }>;
  };
}

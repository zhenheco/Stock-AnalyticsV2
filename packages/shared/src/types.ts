export type SourceKind = "ptt" | "rss" | "finmind";

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
}

export interface Candidate {
  symbol: string;
  name: string;
  score: number;
  eventCount: number;
  sourceCount: number;
  latestTitle: string;
  latestAt: string;
  sources: SourceKind[];
  tags: string[];
  reason: string;
}

export interface WatchlistEntry {
  symbol: string;
  name: string;
  addedAt: string;
}

export interface LlmClassification {
  sentiment: number;
  tags: string[];
  reason: string;
}

export interface FinMindRow {
  stock_id: string;
  stock_name?: string;
  close?: number;
  Trading_Volume?: number;
}

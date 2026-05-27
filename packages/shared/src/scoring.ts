import type { Candidate, EventRecord, SourceKind } from "./types";

const SOURCE_WEIGHTS: Record<SourceKind, number> = {
  ptt: 1,
  rss: 1.2,
  finmind: 0.8
};

export function scoreCandidates(events: EventRecord[], names: Record<string, string> = {}): Candidate[] {
  const groups = new Map<string, EventRecord[]>();
  for (const event of events) {
    groups.set(event.symbol, [...(groups.get(event.symbol) ?? []), event]);
  }

  return [...groups.entries()]
    .map(([symbol, symbolEvents]) => toCandidate(symbol, symbolEvents, names[symbol] ?? symbol))
    .sort((left, right) => right.score - left.score || right.latestAt.localeCompare(left.latestAt));
}

function toCandidate(symbol: string, events: EventRecord[], name: string): Candidate {
  const sorted = [...events].sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
  const latest = sorted[0];
  const sources = unique(events.map((event) => event.source));
  const tags = unique(events.flatMap((event) => event.tags)).slice(0, 5);
  const engagementScore = Math.log10(1 + Math.max(0, sum(events.map((event) => event.engagement))));
  const sentimentScore = average(events.map((event) => event.sentiment)) - 3;
  const sourceScore = sources.reduce((total, source) => total + SOURCE_WEIGHTS[source], 0);
  const rawScore = events.length * 1.5 + sourceScore * 1.8 + engagementScore + sentimentScore;

  return {
    symbol,
    name,
    score: round(rawScore),
    eventCount: events.length,
    sourceCount: sources.length,
    latestTitle: latest?.title ?? "",
    latestAt: latest?.publishedAt ?? "",
    sources,
    tags,
    reason: latest?.reason ?? "事件訊號浮現"
  };
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function sum(items: number[]): number {
  return items.reduce((total, value) => total + value, 0);
}

function average(items: number[]): number {
  return items.length === 0 ? 3 : sum(items) / items.length;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

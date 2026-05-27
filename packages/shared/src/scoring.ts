import type { Candidate, EventRecord, SourceKind } from "./types";

const SOURCE_WEIGHTS: Record<SourceKind, number> = {
  ptt: 1,
  rss: 1.2,
  finmind: 0.8,
  twse: 1.1
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
  const eventScore = sum(events.map(eventWeight)) * 1.5;
  const catalystScore = sum(events.map(catalystWeight));
  const rawScore = eventScore + sourceScore * 1.8 + engagementScore + sentimentScore + catalystScore;

  return {
    symbol,
    name,
    score: round(Math.max(0, rawScore)),
    eventCount: events.length,
    sourceCount: sources.length,
    sourceEventCounts: countBySource(events),
    latestTitle: latest?.title ?? "",
    latestAt: latest?.publishedAt ?? "",
    sources,
    tags,
    reason: latest?.reason ?? "事件訊號浮現"
  };
}

function countBySource(events: EventRecord[]): Partial<Record<SourceKind, number>> {
  return events.reduce<Partial<Record<SourceKind, number>>>((counts, event) => ({
    ...counts,
    [event.source]: (counts[event.source] ?? 0) + 1
  }), {});
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

function eventWeight(event: EventRecord): number {
  if (event.tags.includes("公告")) {
    return 0.35;
  }
  if (event.tags.some((tag) => ["AI", "產業題材", "營收", "先進封裝", "價格量能"].includes(tag))) {
    return 1.2;
  }
  return 1;
}

function catalystWeight(event: EventRecord): number {
  return event.tags.reduce((total, tag) => {
    if (tag === "公告") {
      return total - 1.1;
    }
    if (tag === "AI") {
      return total + 0.8;
    }
    if (tag === "產業題材") {
      return total + 0.7;
    }
    if (tag === "營收" || tag === "先進封裝" || tag === "價格量能") {
      return total + 0.5;
    }
    return total;
  }, 0);
}

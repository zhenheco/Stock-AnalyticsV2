import type { Candidate, EventRecord, FinMindMetrics, ScoreBreakdown, SourceKind } from "./types";

const SOURCE_WEIGHTS: Record<SourceKind, number> = {
  ptt: 1,
  rss: 1.2,
  finmind: 0.8,
  twse: 1.3,
  mops: 1.6
};

interface ScoreOptions {
  watchlistSymbols?: ReadonlySet<string>;
}

export function scoreCandidates(events: EventRecord[], names: Record<string, string> = {}, options: ScoreOptions = {}): Candidate[] {
  const groups = new Map<string, EventRecord[]>();
  for (const event of events) {
    groups.set(event.symbol, [...(groups.get(event.symbol) ?? []), event]);
  }

  return [...groups.entries()]
    .map(([symbol, symbolEvents]) => toCandidate(symbol, dedupeSymbolEvents(symbolEvents), names[symbol] ?? symbol, options))
    .sort((left, right) => right.score - left.score || right.latestAt.localeCompare(left.latestAt));
}

function toCandidate(symbol: string, events: EventRecord[], name: string, options: ScoreOptions): Candidate {
  const sorted = [...events].sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
  const latest = sorted[0];
  const sources = unique(events.map((event) => event.source));
  const tags = unique(events.flatMap((event) => event.tags)).slice(0, 5);
  const engagementScore = Math.log10(1 + Math.max(0, sum(events.map((event) => event.engagement))));
  const sentimentScore = average(events.map((event) => event.sentiment)) - 3;
  const eventStrength = round(sum(events.map(eventWeight)) * 1.5 + catalystScore(events));
  const sourceConfidence = round(sources.reduce((total, source) => total + SOURCE_WEIGHTS[source], 0));
  const freshness = round(freshnessWeight(latest?.publishedAt));
  const crossSourceBoost = round(Math.max(0, sources.length - 1) * 1.2);
  const watchlistBoost = options.watchlistSymbols?.has(symbol) ? 0.5 : 0;
  const aggregatedMetrics = aggregateMetrics(events);
  const derivedSignal = derivedSignalScore(aggregatedMetrics);
  const scoreBreakdown: ScoreBreakdown = {
    eventStrength,
    sourceConfidence,
    freshness,
    crossSourceBoost,
    watchlistBoost,
    derivedSignal
  };
  const rawScore = events.every((event) => event.tags.includes("公告"))
    ? 0
    : eventStrength + sourceConfidence * 1.8 + engagementScore + sentimentScore + freshness + crossSourceBoost + watchlistBoost + derivedSignal;
  const confidenceScore = confidenceFrom(events, sources);

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
    reason: candidateReason(events, latest?.reason),
    scoreBreakdown,
    confidenceScore,
    metrics: aggregatedMetrics
  };
}

function dedupeSymbolEvents(events: EventRecord[]): EventRecord[] {
  const byStory = new Map<string, EventRecord>();
  for (const event of events) {
    const key = `${event.symbol}:${event.source}:${normalizeStoryTitle(event.title)}`;
    const current = byStory.get(key);
    if (!current || event.publishedAt > current.publishedAt) {
      byStory.set(key, event);
    }
  }
  return [...byStory.values()];
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

const DERIVED_SIGNAL_CONFIG = {
  priceChangeDivisor: 4,
  priceChangeCap: 3,
  volumeRatioCap: 2,
  limitFlagBonus: 1,
  revenueYoYDivisor: 15,
  revenueYoYCap: 3,
  recentHighBonus: 0.5
} as const;

function aggregateMetrics(events: EventRecord[]): FinMindMetrics | undefined {
  const withMetrics = events.filter((event): event is EventRecord & { metrics: FinMindMetrics } => event.metrics !== undefined);
  if (withMetrics.length === 0) {
    return undefined;
  }

  const strongestPrice = withMetrics
    .filter((event) => event.metrics.priceChangePct !== undefined)
    .reduce<EventRecord & { metrics: FinMindMetrics } | undefined>((best, event) =>
      !best || Math.abs(event.metrics.priceChangePct ?? 0) > Math.abs(best.metrics.priceChangePct ?? 0) ? event : best, undefined);

  const latestRevenue = [...withMetrics]
    .filter((event) => event.metrics.revenueYoYPct !== undefined || event.metrics.revenueMoMPct !== undefined)
    .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt))[0];

  return {
    priceChangePct: strongestPrice?.metrics.priceChangePct,
    volumeRatio: strongestPrice?.metrics.volumeRatio,
    limitFlag: withMetrics.find((event) => event.metrics.limitFlag !== undefined)?.metrics.limitFlag,
    avgDailyTurnoverTwd: firstDefined(withMetrics.map((event) => event.metrics.avgDailyTurnoverTwd)),
    liquidityTier: firstDefined(withMetrics.map((event) => event.metrics.liquidityTier)),
    revenueYoYPct: latestRevenue?.metrics.revenueYoYPct,
    revenueMoMPct: latestRevenue?.metrics.revenueMoMPct,
    isRecentHigh: withMetrics.some((event) => event.metrics.isRecentHigh === true) ? true : undefined
  };
}

function firstDefined<T>(values: Array<T | undefined>): T | undefined {
  return values.find((value) => value !== undefined);
}

function derivedSignalScore(metrics: FinMindMetrics | undefined): number {
  if (!metrics) {
    return 0;
  }
  const priceComponent = metrics.priceChangePct === undefined
    ? 0
    : Math.min(DERIVED_SIGNAL_CONFIG.priceChangeCap, Math.abs(metrics.priceChangePct) / DERIVED_SIGNAL_CONFIG.priceChangeDivisor);
  const volumeComponent = metrics.volumeRatio === undefined
    ? 0
    : Math.min(DERIVED_SIGNAL_CONFIG.volumeRatioCap, Math.max(0, metrics.volumeRatio - 1));
  const limitComponent = metrics.limitFlag ? DERIVED_SIGNAL_CONFIG.limitFlagBonus : 0;
  const revenueComponent = metrics.revenueYoYPct === undefined
    ? 0
    : Math.min(DERIVED_SIGNAL_CONFIG.revenueYoYCap, Math.abs(metrics.revenueYoYPct) / DERIVED_SIGNAL_CONFIG.revenueYoYDivisor);
  const recentHighComponent = metrics.isRecentHigh ? DERIVED_SIGNAL_CONFIG.recentHighBonus : 0;
  return round(priceComponent + volumeComponent + limitComponent + revenueComponent + recentHighComponent);
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

function catalystScore(events: EventRecord[]): number {
  return sum(events.map(catalystWeight));
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

function freshnessWeight(value: string | undefined): number {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  const ageHours = Math.max(0, (Date.now() - parsed) / 36e5);
  if (ageHours <= 24) {
    return 1.5;
  }
  if (ageHours <= 72) {
    return 0.8;
  }
  return 0.2;
}

function confidenceFrom(events: EventRecord[], sources: SourceKind[]): number {
  const sourceTrust = sources.reduce((total, source) => {
    if (source === "mops") {
      return total + 36;
    }
    if (source === "twse") {
      return total + 32;
    }
    if (source === "rss") {
      return total + 20;
    }
    if (source === "finmind") {
      return total + 16;
    }
    return total + 10;
  }, 0);
  const multiSource = Math.max(0, sources.length - 1) * 12;
  const eventDepth = Math.min(18, events.length * 4);
  const explicitConfidence = average(events.flatMap((event) => typeof event.confidenceScore === "number" ? [event.confidenceScore] : []));
  const fallback = sourceTrust + multiSource + eventDepth;
  return Math.min(100, Math.round(explicitConfidence === 3 ? fallback : (fallback + explicitConfidence) / 2));
}

function candidateReason(events: EventRecord[], fallback: string | undefined): string {
  const sources = new Set(events.map((event) => event.source));
  if (sources.has("mops")) {
    return "MOPS 官方重訊與其他事件訊號共振";
  }
  if (sources.has("twse")) {
    return "TWSE 官方訊息與其他事件訊號共振";
  }
  if (sources.size > 1) {
    return "多來源事件訊號共振";
  }
  return fallback ?? "事件訊號浮現";
}

function normalizeStoryTitle(title: string): string {
  return title
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[【】\[\]\(\)（）:：,，.。!！?\s]/g, "")
    .toLowerCase();
}

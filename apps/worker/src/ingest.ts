import {
  extractMentionedSymbols,
  normalizeFinMindRows,
  normalizeFinMindStockInfoRows,
  normalizeMopsMaterialInfoRows,
  normalizeTwseNewsRows,
  parsePttTitles,
  parseRssItems,
  scoreCandidates,
  type EventRecord,
  type FinMindMetrics,
  type FinMindRow,
  type FinMindStockInfoRow,
  type MopsMaterialInfoRow,
  type SecurityType,
  type SourceEvent,
  type TwseNewsRow
} from "@stock-analytics/shared";
import type { EventClassifier } from "./classifier";
import type { Repository } from "./repository/types";

export interface IngestionSources {
  pttHtml?: string;
  rssXml?: string;
  twseNewsRows?: TwseNewsRow[];
  mopsMaterialRows?: MopsMaterialInfoRow[];
  finmindRows?: FinMindRow[];
  finmindStockInfoRows?: FinMindStockInfoRow[];
}

export interface IngestionInput {
  repo: Repository;
  now: string;
  sources: IngestionSources;
  classifier?: EventClassifier;
  classifierLimit?: number;
}

export async function runIngestion(input: IngestionInput): Promise<void> {
  const existingUniverse = await input.repo.listUniverse();
  const incomingUniverse = input.sources.finmindStockInfoRows
    ? normalizeFinMindStockInfoRows(input.sources.finmindStockInfoRows, input.now)
    : [];
  const aliases = buildAliasMap([...existingUniverse, ...incomingUniverse]);
  const validSymbols = new Set([...existingUniverse, ...incomingUniverse].map((stock) => stock.symbol));
  const universeNames = {
    ...Object.fromEntries(existingUniverse.map((stock) => [stock.symbol, stock.name])),
    ...Object.fromEntries(incomingUniverse.map((stock) => [stock.symbol, stock.name]))
  };
  const securityTypes = new Map<string, SecurityType>([
    ...existingUniverse.map((stock) => [stock.symbol, stock.securityType] as const),
    ...incomingUniverse.map((stock) => [stock.symbol, stock.securityType] as const)
  ]);
  const finmindRows = enrichFinMindRowNames(input.sources.finmindRows ?? [], universeNames);
  const sourceEvents = [
    ...(input.sources.pttHtml ? parsePttTitles(input.sources.pttHtml, "https://www.ptt.cc", aliases, validSymbols) : []),
    ...(input.sources.rssXml ? parseRssItems(input.sources.rssXml, aliases, validSymbols, false) : []),
    ...(input.sources.twseNewsRows ? normalizeTwseNewsRows(input.sources.twseNewsRows, aliases, validSymbols) : []),
    ...(input.sources.mopsMaterialRows ? normalizeMopsMaterialInfoRows(input.sources.mopsMaterialRows) : []),
    ...normalizeFinMindRows(finmindRows, input.now, securityTypes)
  ];
  const relevantSymbols = collectRelevantSymbols(sourceEvents, finmindRows);
  const relevantUniverse = incomingUniverse.filter((stock) => relevantSymbols.has(stock.symbol));
  const universeToPersist = incomingUniverse.length > 0 && await input.repo.countUniverse() === 0 ? incomingUniverse : relevantUniverse;
  if (universeToPersist.length > 0) {
    await input.repo.upsertUniverse(universeToPersist);
  }

  const names = {
    ...(await listUniverseNames(input.repo)),
    ...Object.fromEntries(finmindRows.map((row) => [row.stock_id, row.stock_name ?? row.stock_id]))
  };

  await persistSourceEvents(input.repo, sourceEvents, names, {
    classifier: input.classifier,
    classifierLimit: input.classifierLimit
  });
}

interface ClassificationOptions {
  classifier?: EventClassifier;
  classifierLimit?: number;
  reclassify?: boolean;
}

export async function persistSourceEvents(
  repo: Repository,
  sourceEvents: SourceEvent[],
  names: Record<string, string> = {},
  options: ClassificationOptions = {}
): Promise<void> {
  const events = (await classifySourceEvents(sourceEvents, options)).flatMap(({ event, classification }) => expandSymbols(event, classification));
  await repo.saveEvents(events);
  await recomputeCandidates(repo, names, { reclassify: false });
}

export async function recomputeCandidates(repo: Repository, names: Record<string, string> = {}, options: ClassificationOptions = {}): Promise<void> {
  const universe = await repo.listUniverse();
  const aliases = buildAliasMap(universe);
  const validSymbols = new Set(universe.map((stock) => stock.symbol));
  const supportedEvents = (await repo.listEvents())
    .filter((event) => isStoredEventStillSupported(event, aliases, validSymbols));
  const events = options.reclassify === false
    ? supportedEvents
    : await reclassifyStoredEvents(supportedEvents, options);
  await repo.replaceEvents(events);
  const candidates = scoreCandidates(events, {
    ...Object.fromEntries(universe.map((stock) => [stock.symbol, stock.name])),
    ...names
  }, {
    watchlistSymbols: new Set((await repo.listWatchlist()).map((entry) => entry.symbol))
  });
  await repo.saveCandidates(candidates);
}

export function expandSymbols(event: SourceEvent, classification = classifyEvent(event.title, event.source)): EventRecord[] {
  return event.symbols.map((symbol) => {
    return {
      id: `${event.source}:${symbol}:${event.url}`,
      source: event.source,
      symbol,
      title: event.title,
      url: event.url,
      publishedAt: event.publishedAt,
      engagement: event.engagement,
      tags: mergeTags(finMindDerivedTags(event.metrics), classification.tags),
      sentiment: classification.sentiment,
      reason: classification.reason,
      metrics: event.metrics
    };
  });
}

async function classifySourceEvents(
  sourceEvents: SourceEvent[],
  options: ClassificationOptions
): Promise<Array<{ event: SourceEvent; classification: ReturnType<typeof classifyEvent> }>> {
  let llmCount = 0;
  const limit = options.classifierLimit ?? 20;
  return Promise.all(sourceEvents.map(async (event) => {
    const useLlm = Boolean(options.classifier && event.source !== "finmind" && llmCount < limit);
    if (useLlm) {
      llmCount += 1;
    }
    const classification = await classifyWithFallback(event, options, useLlm);
    return { event, classification };
  }));
}

async function reclassifyStoredEvents(events: EventRecord[], options: ClassificationOptions): Promise<EventRecord[]> {
  let llmCount = 0;
  const limit = options.classifierLimit ?? 20;
  return Promise.all(events.map(async (event) => {
    const useLlm = Boolean(options.classifier && event.source !== "finmind" && llmCount < limit);
    if (useLlm) {
      llmCount += 1;
    }
    const classification = await classifyWithFallback(event, options, useLlm);
    return {
      ...event,
      tags: mergeTags(finMindDerivedTags(event.metrics), classification.tags),
      sentiment: classification.sentiment,
      reason: classification.reason
    };
  }));
}

async function classifyWithFallback(
  event: Pick<SourceEvent, "source" | "title" | "engagement">,
  options: ClassificationOptions,
  canUseLlm: boolean
): Promise<ReturnType<typeof classifyEvent>> {
  const fallback = classifyEvent(event.title, event.source);
  if (!options.classifier || !canUseLlm || event.source === "finmind") {
    return fallback;
  }
  try {
    const classification = await options.classifier.classify(event);
    return {
      sentiment: classification.sentiment,
      tags: classification.tags.length > 0 ? classification.tags : fallback.tags,
      reason: classification.reason || fallback.reason
    };
  } catch {
    return fallback;
  }
}

function isStoredEventStillSupported(event: EventRecord, aliases: Record<string, string>, validSymbols: ReadonlySet<string>): boolean {
  if (event.title.match(/\sclose N\/A volume 0$/)) {
    return false;
  }
  if (isFinMindPriceSummary(event) && isNewPriceSummaryTitle(event.title) && event.metrics?.priceChangePct === undefined) {
    return false;
  }
  if (!validSymbols.has(event.symbol)) {
    return true;
  }
  return extractMentionedSymbols(event.title, aliases, validSymbols).includes(event.symbol);
}

function isFinMindPriceSummary(event: EventRecord): boolean {
  return event.source === "finmind" && event.url.includes("dataset=TaiwanStockPrice");
}

function isNewPriceSummaryTitle(title: string): boolean {
  return / 收 /.test(title);
}

function finMindDerivedTags(metrics?: FinMindMetrics): string[] {
  if (!metrics) {
    return [];
  }
  return [
    ...(metrics.limitFlag === "limit_up" ? ["漲停"] : []),
    ...(metrics.limitFlag === "limit_down" ? ["跌停"] : []),
    ...(typeof metrics.volumeRatio === "number" && metrics.volumeRatio >= 2 ? ["爆量"] : []),
    ...(metrics.isRecentHigh ? ["營收創高"] : []),
    ...(typeof metrics.revenueYoYPct === "number" && metrics.revenueYoYPct >= 20 ? ["高成長"] : [])
  ];
}

function mergeTags(derived: string[], base: string[]): string[] {
  return [...new Set([...derived, ...base])].slice(0, 3);
}

function classifyEvent(title: string, source: SourceEvent["source"]): { sentiment: number; tags: string[]; reason: string } {
  const isAnnouncement = title.includes("【公告】") || title.match(/股東會|股東常會|董事會|解除董事競業|自結|重要決議|財務報告/);
  const isIndustryCatalyst = title.match(/商機|機器人|供應鏈|訂單|需求|報價|漲停|大漲|攻/);
  const isChipSignal = title.match(/買超|賣超|融資|融券|外資|投信|自營商/);
  const isMaterialInfo = source === "mops";
  const tags = [
    isAnnouncement ? "公告" : "",
    isMaterialInfo ? "重大訊息" : "",
    title.includes("AI") ? "AI" : "",
    isIndustryCatalyst ? "產業題材" : "",
    title.includes("封裝") ? "先進封裝" : "",
    title.includes("營收") ? "營收" : "",
    isChipSignal ? "籌碼" : "",
    source === "ptt" ? "討論熱度" : "",
    source === "finmind" ? "價格量能" : "",
    source === "twse" || source === "mops" ? "官方訊息" : ""
  ].filter(Boolean);

  return {
    sentiment: isAnnouncement && !isMaterialInfo ? 2 : title.match(/升溫|增加|爆量|成長|強|商機|大漲|漲停/) ? 4 : 3,
    tags: tags.slice(0, 3),
    reason: isAnnouncement && !isMaterialInfo ? "公告事件，可信但催化程度較低" : source === "mops" ? "MOPS 官方重大訊息命中" : source === "twse" ? "TWSE 官方事件訊號命中" : source === "finmind" && isChipSignal ? "FinMind 籌碼訊號命中" : `${source} 事件訊號命中`
  };
}

async function listUniverseNames(repo: Repository): Promise<Record<string, string>> {
  return Object.fromEntries((await repo.listUniverse()).map((stock) => [stock.symbol, stock.name]));
}

function collectRelevantSymbols(sourceEvents: SourceEvent[], finmindRows: FinMindRow[]): Set<string> {
  return new Set([
    ...sourceEvents.flatMap((event) => event.symbols),
    ...finmindRows.map((row) => row.stock_id)
  ]);
}

function buildAliasMap(stocks: Array<{ symbol: string; name: string }>): Record<string, string> {
  return Object.fromEntries(stocks
    .filter((stock) => stock.name.trim().length >= 2)
    .map((stock) => [stock.name.trim(), stock.symbol]));
}

function enrichFinMindRowNames(rows: FinMindRow[], universeNames: Record<string, string>): FinMindRow[] {
  return rows.map((row) => ({
    ...row,
    stock_name: row.stock_name ?? universeNames[row.stock_id] ?? row.stock_id
  }));
}

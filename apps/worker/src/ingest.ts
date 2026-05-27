import {
  normalizeFinMindRows,
  normalizeFinMindStockInfoRows,
  parsePttTitles,
  parseRssItems,
  scoreCandidates,
  type EventRecord,
  type FinMindRow,
  type FinMindStockInfoRow,
  type SourceEvent
} from "@stock-analytics/shared";
import type { Repository } from "./repository/types";

export interface IngestionSources {
  pttHtml?: string;
  rssXml?: string;
  finmindRows?: FinMindRow[];
  finmindStockInfoRows?: FinMindStockInfoRow[];
}

export interface IngestionInput {
  repo: Repository;
  now: string;
  sources: IngestionSources;
}

export async function runIngestion(input: IngestionInput): Promise<void> {
  const existingUniverse = await input.repo.listUniverse();
  const incomingUniverse = input.sources.finmindStockInfoRows
    ? normalizeFinMindStockInfoRows(input.sources.finmindStockInfoRows, input.now)
    : [];
  const aliases = buildAliasMap([...existingUniverse, ...incomingUniverse]);
  const validSymbols = new Set([...existingUniverse, ...incomingUniverse].map((stock) => stock.symbol));
  const sourceEvents = [
    ...(input.sources.pttHtml ? parsePttTitles(input.sources.pttHtml, "https://www.ptt.cc", aliases, validSymbols) : []),
    ...(input.sources.rssXml ? parseRssItems(input.sources.rssXml, aliases, validSymbols, false) : []),
    ...(input.sources.finmindRows ? normalizeFinMindRows(input.sources.finmindRows, input.now) : [])
  ];
  const relevantSymbols = collectRelevantSymbols(sourceEvents, input.sources.finmindRows ?? []);
  const relevantUniverse = incomingUniverse.filter((stock) => relevantSymbols.has(stock.symbol));
  const universeToPersist = incomingUniverse.length > 0 && await input.repo.countUniverse() === 0 ? incomingUniverse : relevantUniverse;
  if (universeToPersist.length > 0) {
    await input.repo.upsertUniverse(universeToPersist);
  }

  const names = {
    ...(await listUniverseNames(input.repo)),
    ...Object.fromEntries((input.sources.finmindRows ?? []).map((row) => [row.stock_id, row.stock_name ?? row.stock_id]))
  };

  await persistSourceEvents(input.repo, sourceEvents, names);
}

export async function persistSourceEvents(repo: Repository, sourceEvents: SourceEvent[], names: Record<string, string> = {}): Promise<void> {
  const events = sourceEvents.flatMap((event) => expandSymbols(event));
  await repo.saveEvents(events);
  await recomputeCandidates(repo, names);
}

export async function recomputeCandidates(repo: Repository, names: Record<string, string> = {}): Promise<void> {
  const events = (await repo.listEvents()).map(reclassifyEventRecord);
  await repo.saveEvents(events);
  const candidates = scoreCandidates(events, {
    ...(await listUniverseNames(repo)),
    ...names
  });
  await repo.saveCandidates(candidates);
}

export function expandSymbols(event: SourceEvent): EventRecord[] {
  return event.symbols.map((symbol) => {
    const classification = classifyEvent(event.title, event.source);
    return {
      id: `${event.source}:${symbol}:${event.url}`,
      source: event.source,
      symbol,
      title: event.title,
      url: event.url,
      publishedAt: event.publishedAt,
      engagement: event.engagement,
      tags: classification.tags,
      sentiment: classification.sentiment,
      reason: classification.reason
    };
  });
}

function reclassifyEventRecord(event: EventRecord): EventRecord {
  const classification = classifyEvent(event.title, event.source);
  return {
    ...event,
    tags: classification.tags,
    sentiment: classification.sentiment,
    reason: classification.reason
  };
}

function classifyEvent(title: string, source: SourceEvent["source"]): { sentiment: number; tags: string[]; reason: string } {
  const isAnnouncement = title.includes("【公告】") || title.match(/股東會|股東常會|董事會|解除董事競業|自結|重要決議|財務報告/);
  const isIndustryCatalyst = title.match(/商機|機器人|供應鏈|訂單|需求|報價|漲停|大漲|攻/);
  const isChipSignal = title.match(/買超|賣超|融資|融券|外資|投信|自營商/);
  const tags = [
    isAnnouncement ? "公告" : "",
    title.includes("AI") ? "AI" : "",
    isIndustryCatalyst ? "產業題材" : "",
    title.includes("封裝") ? "先進封裝" : "",
    title.includes("營收") ? "營收" : "",
    isChipSignal ? "籌碼" : "",
    source === "ptt" ? "討論熱度" : "",
    source === "finmind" ? "價格量能" : ""
  ].filter(Boolean);

  return {
    sentiment: isAnnouncement ? 2 : title.match(/升溫|增加|爆量|成長|強|商機|大漲|漲停/) ? 4 : 3,
    tags: tags.slice(0, 3),
    reason: isAnnouncement ? "公告事件，可信但催化程度較低" : source === "finmind" && isChipSignal ? "FinMind 籌碼訊號命中" : `${source} 事件訊號命中`
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

import {
  normalizeFinMindRows,
  parsePttTitles,
  parseRssItems,
  scoreCandidates,
  type EventRecord,
  type FinMindRow,
  type SourceEvent
} from "@stock-analytics/shared";
import type { Repository } from "./repository/types";

export interface IngestionSources {
  pttHtml?: string;
  rssXml?: string;
  finmindRows?: FinMindRow[];
}

export interface IngestionInput {
  repo: Repository;
  now: string;
  sources: IngestionSources;
}

export async function runIngestion(input: IngestionInput): Promise<void> {
  const sourceEvents = [
    ...(input.sources.pttHtml ? parsePttTitles(input.sources.pttHtml) : []),
    ...(input.sources.rssXml ? parseRssItems(input.sources.rssXml) : []),
    ...(input.sources.finmindRows ? normalizeFinMindRows(input.sources.finmindRows, input.now) : [])
  ];
  const events = sourceEvents.flatMap((event) => expandSymbols(event));
  const names = Object.fromEntries((input.sources.finmindRows ?? []).map((row) => [row.stock_id, row.stock_name ?? row.stock_id]));

  await persistSourceEvents(input.repo, sourceEvents, names);
}

export async function persistSourceEvents(repo: Repository, sourceEvents: SourceEvent[], names: Record<string, string> = {}): Promise<void> {
  const events = sourceEvents.flatMap((event) => expandSymbols(event));
  await repo.saveEvents(events);
  await recomputeCandidates(repo, names);
}

export async function recomputeCandidates(repo: Repository, names: Record<string, string> = {}): Promise<void> {
  const candidates = scoreCandidates(await repo.listEvents(), names);
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

function classifyEvent(title: string, source: SourceEvent["source"]): { sentiment: number; tags: string[]; reason: string } {
  const tags = [
    title.includes("AI") ? "AI" : "",
    title.includes("封裝") ? "先進封裝" : "",
    title.includes("營收") ? "營收" : "",
    source === "ptt" ? "討論熱度" : "",
    source === "finmind" ? "價格量能" : ""
  ].filter(Boolean);

  return {
    sentiment: title.match(/升溫|增加|爆量|成長|強/) ? 4 : 3,
    tags: tags.slice(0, 3),
    reason: `${source} 事件訊號命中`
  };
}

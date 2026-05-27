import { extractMentionedSymbols } from "./entity";
import type { FinMindRow, FinMindStockInfoRow, SecurityType, SourceEvent, UniverseStock } from "./types";

export function parsePttTitles(html: string, baseUrl = "https://www.ptt.cc", aliases: Record<string, string> = {}): SourceEvent[] {
  const blocks = html
    .split('<div class="r-ent">')
    .slice(1)
    .map((block) => block.split('<div class="r-list-sep"></div>')[0] ?? block);

  return blocks.flatMap((block) => {
    const titleMatch = block.match(/<div class="title">\s*<a href="([^"]+)">([\s\S]*?)<\/a>\s*<\/div>/);
    if (!titleMatch?.[1] || !titleMatch[2]) {
      return [];
    }

    const dateText = textContent(block.match(/<div class="date">([\s\S]*?)<\/div>/)?.[1] ?? "");
    const title = decodeHtml(textContent(titleMatch[2]));
    const symbols = extractMentionedSymbols(title, aliases);
    if (symbols.length === 0) {
      return [];
    }

    return [{
      source: "ptt" as const,
      title,
      url: new URL(titleMatch[1], baseUrl).toString(),
      publishedAt: parsePttDate(dateText),
      engagement: parsePushCount(block),
      symbols
    }];
  });
}

export function parseRssItems(xml: string, aliases: Record<string, string> = {}): SourceEvent[] {
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];

  return blocks.flatMap((block) => {
    const title = decodeHtml(extractTag(block, "title"));
    const link = decodeHtml(extractTag(block, "link"));
    const published = extractTag(block, "pubDate");
    const symbols = extractMentionedSymbols(title, aliases);
    if (!title || !link || symbols.length === 0) {
      return [];
    }

    return [{
      source: "rss" as const,
      title,
      url: link,
      publishedAt: new Date(published).toISOString(),
      engagement: 0,
      symbols
    }];
  });
}

export function normalizeFinMindRows(rows: FinMindRow[], now: string): SourceEvent[] {
  return rows.flatMap((row) => {
    const title = `${row.stock_id} ${row.stock_name ?? row.stock_id} close ${row.close ?? "N/A"} volume ${row.Trading_Volume ?? 0}`;
    const symbols = extractMentionedSymbols(title);
    if (symbols.length === 0) {
      return [];
    }

    return [{
      source: "finmind" as const,
      title,
      url: `https://finmindtrade.com/analysis/#/data/api?dataset=TaiwanStockPrice&data_id=${row.stock_id}`,
      publishedAt: now,
      engagement: Number(row.Trading_Volume ?? 0),
      symbols
    }];
  });
}

export function normalizeFinMindStockInfoRows(rows: FinMindStockInfoRow[], now: string): UniverseStock[] {
  const bySymbol = new Map<string, UniverseStock>();

  for (const row of rows) {
    const symbol = normalizeSymbol(row.stock_id);
    const name = row.stock_name?.trim();
    if (!symbol || !name || !/^\d{4,6}[A-Z]?$/.test(symbol)) {
      continue;
    }

    bySymbol.set(symbol, {
      symbol,
      name,
      ...(row.market_category?.trim() ? { market: row.market_category.trim() } : {}),
      ...(row.industry_category?.trim() ? { industry: row.industry_category.trim() } : {}),
      securityType: inferSecurityType(row),
      updatedAt: now
    });
  }

  return [...bySymbol.values()];
}

function parsePushCount(block: string): number {
  const raw = textContent(block.match(/<div class="nrec">([\s\S]*?)<\/div>/)?.[1] ?? "");
  if (raw === "爆") {
    return 100;
  }
  if (raw.startsWith("X")) {
    return -Number(raw.slice(1) || "0");
  }
  return Number(raw || "0");
}

function parsePttDate(value: string): string {
  const [monthText, dayText] = value.trim().split("/");
  const month = Number(monthText);
  const day = Number(dayText);
  const year = new Date().getFullYear();
  const paddedMonth = String(month).padStart(2, "0");
  const paddedDay = String(day).padStart(2, "0");
  return `${year}-${paddedMonth}-${paddedDay}T00:00:00.000+08:00`;
}

function extractTag(xml: string, tag: string): string {
  return textContent(xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))?.[1] ?? "");
}

function textContent(value: string): string {
  return value.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function decodeHtml(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'");
}

function normalizeSymbol(value: string | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

function inferSecurityType(row: FinMindStockInfoRow): SecurityType {
  const raw = `${row.type ?? ""} ${row.industry_category ?? ""} ${row.market_category ?? ""}`.toLowerCase();
  if (raw.includes("etf")) {
    return "etf";
  }
  if (raw.includes("etn")) {
    return "etn";
  }
  if (raw.includes("index") || raw.includes("指數")) {
    return "index";
  }
  if ((row.stock_id ?? "").match(/^\d{4,6}[A-Z]?$/)) {
    return "stock";
  }
  return "unknown";
}

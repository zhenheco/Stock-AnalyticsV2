import { extractMentionedSymbols } from "./entity";
import type { FinMindRow, SourceEvent } from "./types";

export function parsePttTitles(html: string, baseUrl = "https://www.ptt.cc"): SourceEvent[] {
  const blocks = html.match(/<div class="r-ent">[\s\S]*?<\/div>\s*<\/div>/g) ?? [];

  return blocks.flatMap((block) => {
    const titleMatch = block.match(/<div class="title">\s*<a href="([^"]+)">([\s\S]*?)<\/a>\s*<\/div>/);
    if (!titleMatch?.[1] || !titleMatch[2]) {
      return [];
    }

    const dateText = textContent(block.match(/<div class="date">([\s\S]*?)<\/div>/)?.[1] ?? "");
    const title = decodeHtml(textContent(titleMatch[2]));
    const symbols = extractMentionedSymbols(title);
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

export function parseRssItems(xml: string): SourceEvent[] {
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];

  return blocks.flatMap((block) => {
    const title = decodeHtml(extractTag(block, "title"));
    const link = decodeHtml(extractTag(block, "link"));
    const published = extractTag(block, "pubDate");
    const symbols = extractMentionedSymbols(title);
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

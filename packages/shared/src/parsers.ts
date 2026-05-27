import { extractMentionedSymbols } from "./entity";
import type { FinMindRow, FinMindStockInfoRow, SecurityType, SourceEvent, UniverseStock } from "./types";

export function parsePttTitles(
  html: string,
  baseUrl = "https://www.ptt.cc",
  aliases: Record<string, string> = {},
  validSymbols?: ReadonlySet<string>,
  includeNumericSymbols = true
): SourceEvent[] {
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
    const symbols = extractMentionedSymbols(title, aliases, validSymbols, includeNumericSymbols);
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

export function parseRssItems(
  xml: string,
  aliases: Record<string, string> = {},
  validSymbols?: ReadonlySet<string>,
  includeNumericSymbols = true
): SourceEvent[] {
  const blocks = rssItemBlocks(xml);

  return blocks.flatMap((block) => {
    const title = decodeHtml(decodeCdata(extractTag(block, "title")));
    const link = decodeHtml(decodeCdata(extractTag(block, "link")));
    const published = extractTag(block, "pubDate");
    const symbols = extractMentionedSymbols(title, aliases, validSymbols, includeNumericSymbols);
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

export function countRssItems(xml: string): number {
  return rssItemBlocks(xml).length;
}

export function normalizeFinMindRows(rows: FinMindRow[], now: string): SourceEvent[] {
  return rows.flatMap((row) => {
    const symbol = normalizeSymbol(row.stock_id);
    if (!/^\d{4,6}[A-Z]?$/.test(symbol)) {
      return [];
    }
    const name = row.stock_name ?? symbol;

    if (isMarginRow(row)) {
      const delta = marginDelta(row);
      const label = translateMarginName(row.name);
      const direction = delta >= 0 ? "增加" : "減少";
      const balance = finiteNumber(row.TodayBalance) ? ` 餘額 ${row.TodayBalance}` : "";

      return [{
        source: "finmind" as const,
        title: `${symbol} ${name} ${label}${direction} ${Math.abs(delta)} 張${balance}`,
        url: finMindUrl("TaiwanStockMarginPurchaseShortSale", symbol, row.name),
        publishedAt: now,
        engagement: Math.abs(delta),
        symbols: [symbol]
      }];
    }

    if (isInstitutionalRow(row)) {
      const net = Number(row.buy ?? 0) - Number(row.sell ?? 0);
      const direction = net >= 0 ? "買超" : "賣超";

      return [{
        source: "finmind" as const,
        title: `${symbol} ${name} ${translateInstitutionName(row.name)} ${direction} ${Math.abs(net)} 股`,
        url: finMindUrl("TaiwanStockInstitutionalInvestorsBuySell", symbol, row.name),
        publishedAt: now,
        engagement: Math.abs(net),
        symbols: [symbol]
      }];
    }

    if (!finiteNumber(row.close) && !finiteNumber(row.Trading_Volume)) {
      return [];
    }

    const title = `${symbol} ${name} close ${row.close ?? "N/A"} volume ${row.Trading_Volume ?? 0}`;

    return [{
      source: "finmind" as const,
      title,
      url: finMindUrl("TaiwanStockPrice", symbol),
      publishedAt: now,
      engagement: Number(row.Trading_Volume ?? 0),
      symbols: [symbol]
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
  return (xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))?.[1] ?? "").trim();
}

function rssItemBlocks(xml: string): string[] {
  return xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
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

function decodeCdata(value: string): string {
  return value.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
}

function normalizeSymbol(value: string | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

function isInstitutionalRow(row: FinMindRow): boolean {
  return Boolean(row.name && translateInstitutionName(row.name) !== row.name && finiteNumber(row.buy) && finiteNumber(row.sell));
}

function isMarginRow(row: FinMindRow): boolean {
  return ["MarginPurchase", "ShortSale", "MarginPurchaseMoney"].includes(row.name ?? "");
}

function marginDelta(row: FinMindRow): number {
  if (finiteNumber(row.TodayBalance) && finiteNumber(row.YesBalance)) {
    return Number(row.TodayBalance) - Number(row.YesBalance);
  }
  return Number(row.buy ?? 0) - Number(row.sell ?? 0) - Number(row.Return ?? 0);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function translateInstitutionName(value: string | undefined): string {
  const labels: Record<string, string> = {
    Foreign_Investor: "外資",
    Foreign_Dealer_Self: "外資自營",
    Investment_Trust: "投信",
    Dealer_self: "自營商",
    Dealer_Hedging: "避險自營商"
  };
  return labels[value ?? ""] ?? value ?? "法人";
}

function translateMarginName(value: string | undefined): string {
  const labels: Record<string, string> = {
    MarginPurchase: "融資",
    MarginPurchaseMoney: "融資金額",
    ShortSale: "融券"
  };
  return labels[value ?? ""] ?? value ?? "信用交易";
}

function finMindUrl(dataset: string, symbol: string, signalName?: string): string {
  const params = new URLSearchParams();
  params.set("dataset", dataset);
  params.set("data_id", symbol);
  if (signalName) {
    params.set("name", signalName);
  }
  return `https://finmindtrade.com/analysis/#/data/api?${params.toString()}`;
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

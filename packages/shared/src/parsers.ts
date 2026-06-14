import { extractMentionedSymbols } from "./entity";
import { computeFinMindMetrics } from "./finmind-metrics";
import type { FinMindMetrics, FinMindRow, FinMindStockInfoRow, MopsMaterialInfoRow, SecurityType, SourceEvent, TwseNewsRow, UniverseStock } from "./types";

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

export function normalizeTwseNewsRows(
  rows: TwseNewsRow[],
  aliases: Record<string, string> = {},
  validSymbols?: ReadonlySet<string>
): SourceEvent[] {
  return rows.flatMap((row) => {
    const title = decodeHtml(textContent(row.Title ?? ""));
    const url = decodeHtml((row.Url ?? "").trim());
    const symbols = extractMentionedSymbols(title, aliases, validSymbols, true);
    if (!title || !url || symbols.length === 0) {
      return [];
    }

    return [{
      source: "twse" as const,
      title,
      url,
      publishedAt: parseRocDate(row.Date),
      engagement: 0,
      symbols
    }];
  });
}

export function normalizeMopsMaterialInfoRows(rows: MopsMaterialInfoRow[], fallbackUrl = "https://mops.twse.com.tw/mops/web/t05sr01_1"): SourceEvent[] {
  return rows.flatMap((row) => {
    const symbol = normalizeSymbol(row.companyId);
    const name = row.companyName?.trim() ?? "";
    const rawTitle = decodeHtml(textContent(row.title ?? ""));
    if (!/^\d{4,6}[A-Z]?$/.test(symbol) || !rawTitle) {
      return [];
    }

    return [{
      source: "mops" as const,
      title: `${symbol}${name ? ` ${name}` : ""} ${rawTitle}`,
      url: decodeHtml((row.url ?? fallbackUrl).trim()) || fallbackUrl,
      publishedAt: parseMopsDateTime(row.date, row.time),
      engagement: 0,
      symbols: [symbol]
    }];
  });
}

export function normalizeFinMindRows(
  rows: FinMindRow[],
  now: string,
  securityTypes: ReadonlyMap<string, SecurityType> = new Map()
): SourceEvent[] {
  const valid = rows.filter((row) => /^\d{4,6}[A-Z]?$/.test(normalizeSymbol(row.stock_id)));
  const chipRows = valid.filter((row) => isMonthlyRevenueRow(row) === false && (isMarginRow(row) || isInstitutionalRow(row)));
  const revenueRows = valid.filter(isMonthlyRevenueRow);
  const priceRows = valid.filter((row) => !isMonthlyRevenueRow(row) && !isMarginRow(row) && !isInstitutionalRow(row) && (finiteNumber(row.close) || finiteNumber(row.Trading_Volume)));

  return [
    ...chipRows.flatMap((row) => normalizeChipRow(row, now)),
    ...groupBySymbol(priceRows).flatMap(([symbol, group]) => priceSummaryEvent(symbol, group, securityTypes, now)),
    ...groupBySymbol(revenueRows).flatMap(([symbol, group]) => revenueSummaryEvent(symbol, group, now))
  ];
}

function groupBySymbol(rows: FinMindRow[]): Array<[string, FinMindRow[]]> {
  return rows.reduce<Array<[string, FinMindRow[]]>>((groups, row) => {
    const symbol = normalizeSymbol(row.stock_id);
    const existing = groups.find(([groupSymbol]) => groupSymbol === symbol);
    if (!existing) {
      return [...groups, [symbol, [row]]];
    }
    return groups.map(([groupSymbol, groupRows]) => groupSymbol === symbol
      ? [groupSymbol, [...groupRows, row]]
      : [groupSymbol, groupRows]);
  }, []);
}

function normalizeChipRow(row: FinMindRow, now: string): SourceEvent[] {
  const symbol = normalizeSymbol(row.stock_id);
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
      symbols: [symbol],
      metrics: undefined
    }];
  }

  const net = Number(row.buy ?? 0) - Number(row.sell ?? 0);
  const direction = net >= 0 ? "買超" : "賣超";
  return [{
    source: "finmind" as const,
    title: `${symbol} ${name} ${translateInstitutionName(row.name)} ${direction} ${Math.abs(net)} 股`,
    url: finMindUrl("TaiwanStockInstitutionalInvestorsBuySell", symbol, row.name),
    publishedAt: now,
    engagement: Math.abs(net),
    symbols: [symbol],
    metrics: undefined
  }];
}

function priceSummaryEvent(
  symbol: string,
  rows: FinMindRow[],
  securityTypes: ReadonlyMap<string, SecurityType>,
  now: string
): SourceEvent[] {
  const name = rows.find((row) => row.stock_name)?.stock_name ?? symbol;
  const securityType = securityTypes.get(symbol) ?? "unknown";
  const metrics = computeFinMindMetrics(rows, securityType);
  const latest = latestByDate(rows);
  return [{
    source: "finmind" as const,
    title: priceSummaryTitle(symbol, name, latest?.close, metrics),
    url: finMindUrl("TaiwanStockPrice", symbol),
    publishedAt: now,
    engagement: 0,
    symbols: [symbol],
    metrics
  }];
}

function revenueSummaryEvent(symbol: string, rows: FinMindRow[], now: string): SourceEvent[] {
  const name = rows.find((row) => row.stock_name)?.stock_name ?? symbol;
  const metrics = computeFinMindMetrics(rows, "unknown");
  const latest = latestByDate(rows);
  const revenueInHundredMillion = Number(latest?.revenue ?? 0) / 100000000;
  const revenueText = formatNumber(revenueInHundredMillion);
  const revenueMonth = latest?.revenue_year && latest?.revenue_month ? `${latest.revenue_year}/${latest.revenue_month}` : "最新";
  return [{
    source: "finmind" as const,
    title: revenueSummaryTitle(symbol, name, revenueMonth, revenueText, metrics),
    url: finMindUrl("TaiwanStockMonthRevenue", symbol),
    publishedAt: parseFinMindDate(latest?.date, now),
    engagement: 0,
    symbols: [symbol],
    metrics
  }];
}

function latestByDate(rows: FinMindRow[]): FinMindRow | undefined {
  return [...rows].sort((left, right) => (right.date ?? "").localeCompare(left.date ?? ""))[0];
}

function priceSummaryTitle(symbol: string, name: string, close: number | undefined, metrics: FinMindMetrics): string {
  const closeText = finiteNumber(close) ? formatNumber(close) : "N/A";
  const parts = [`${symbol} ${name} 收 ${closeText}`];
  if (typeof metrics.priceChangePct === "number") {
    parts.push(`漲 ${signedPct(metrics.priceChangePct)}`);
  }
  if (typeof metrics.volumeRatio === "number") {
    parts.push(`量 ${metrics.volumeRatio.toFixed(1)}x`);
    if (metrics.volumeRatio >= 2) {
      parts.push("爆量");
    }
  }
  if (metrics.limitFlag === "limit_up") {
    parts.push("漲停");
  }
  if (metrics.limitFlag === "limit_down") {
    parts.push("跌停");
  }
  return parts.join(" ");
}

function revenueSummaryTitle(symbol: string, name: string, revenueMonth: string, revenueText: string, metrics: FinMindMetrics): string {
  const parts = [`${symbol} ${name} ${revenueMonth} 月營收 ${revenueText}億`];
  if (typeof metrics.revenueYoYPct === "number") {
    parts.push(`YoY ${signedPct(metrics.revenueYoYPct)}`);
  }
  if (typeof metrics.revenueMoMPct === "number") {
    parts.push(`MoM ${signedInt(metrics.revenueMoMPct)}`);
  }
  if (metrics.isRecentHigh) {
    parts.push("近3月高");
  }
  return parts.join(" ");
}

function signedPct(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function signedInt(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${Math.round(value)}%`;
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

function isMonthlyRevenueRow(row: FinMindRow): boolean {
  return finiteNumber(row.revenue);
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

function parseFinMindDate(value: string | undefined, fallback: string): string {
  if (!value) {
    return fallback;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function parseRocDate(value: string | undefined): string {
  const normalized = (value ?? "").replace(/\D/g, "");
  if (!/^\d{7}$/.test(normalized)) {
    return new Date(0).toISOString();
  }
  const year = Number(normalized.slice(0, 3)) + 1911;
  const month = normalized.slice(3, 5);
  const day = normalized.slice(5, 7);
  return `${year}-${month}-${day}T00:00:00.000+08:00`;
}

function parseMopsDateTime(date: string | undefined, time: string | undefined): string {
  const normalizedDate = (date ?? "").replace(/\D/g, "");
  if (!/^\d{7}$/.test(normalizedDate)) {
    return new Date(0).toISOString();
  }
  const year = Number(normalizedDate.slice(0, 3)) + 1911;
  const month = normalizedDate.slice(3, 5);
  const day = normalizedDate.slice(5, 7);
  const normalizedTime = (time ?? "00:00:00").match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  const hour = normalizedTime?.[1]?.padStart(2, "0") ?? "00";
  const minute = normalizedTime?.[2] ?? "00";
  const second = normalizedTime?.[3] ?? "00";
  return `${year}-${month}-${day}T${hour}:${minute}:${second}.000+08:00`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
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

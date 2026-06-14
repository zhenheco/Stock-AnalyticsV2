import type { EventRecord, FinMindMetrics, UniverseStock } from "@stock-analytics/shared";
import { ResearchOnlyNotice } from "../components/ResearchOnlyNotice";

interface StockDetailProps {
  symbol: string;
  stock?: UniverseStock | null;
  events: EventRecord[];
  isWatchlisted?: boolean;
  onAddToWatchlist?: () => void;
  onRemoveFromWatchlist?: () => void;
}

export function StockDetail({ symbol, stock, events, isWatchlisted = false, onAddToWatchlist, onRemoveFromWatchlist }: StockDetailProps) {
  const tradingViewSymbol = `TWSE:${symbol}`;
  const widgetUrl = `https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(tradingViewSymbol)}&interval=D&theme=dark`;
  const summary = summarizeResearch(events);
  const eventGroups = groupResearchEvents(events);

  return (
    <main className="detail-page">
      <header className="page-header compact">
        <div>
          <p className="eyebrow">STOCK RESEARCH</p>
          <h1>{stock?.name ? `${symbol} ${stock.name}` : symbol}</h1>
          {stock ? <p className="muted">{[stock.market, stock.industry, stock.securityType].filter(Boolean).join(" / ")}</p> : null}
        </div>
        <div className="detail-actions">
          <a className="ghost-button" href="/">回雷達</a>
          {isWatchlisted ? (
            <>
              <span>已追蹤</span>
              {onRemoveFromWatchlist ? <button className="danger" type="button" onClick={onRemoveFromWatchlist}>移除追蹤</button> : null}
            </>
          ) : onAddToWatchlist ? (
            <button type="button" onClick={onAddToWatchlist}>加入追蹤</button>
          ) : null}
        </div>
      </header>

      <ResearchOnlyNotice />

      <section className="chart-band">
        <div className="chart-copy">
          <p className="eyebrow">External Chart</p>
          <h2>TradingView {tradingViewSymbol}</h2>
          <p>圖表採外部 TradingView，MVP 不在 D1 儲存完整歷史股價，也不自刻 K 線。</p>
          <a href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tradingViewSymbol)}`}>開啟 TradingView</a>
        </div>
        <iframe title={`TradingView ${symbol}`} src={widgetUrl} loading="lazy" />
      </section>

      <section className="research-summary">
        <div className="section-title compact-title">
          <div>
            <p className="eyebrow">Context</p>
            <h2>研究摘要</h2>
          </div>
        </div>
        <div className="summary-grid">
          <article>
            <span>事件數</span>
            <strong>{summary.eventCount}</strong>
          </article>
          <article>
            <span>來源數</span>
            <strong>{summary.sourceCount}</strong>
          </article>
          <article>
            <span>平均情緒</span>
            <strong>{summary.averageSentiment.toFixed(1)}</strong>
          </article>
          <article>
            <span>主要標籤</span>
            <div className="tag-list">
              {summary.topTags.length > 0 ? summary.topTags.map((tag) => <span key={tag}>{tag}</span>) : <span>尚無標籤</span>}
            </div>
          </article>
        </div>
      </section>

      <section className="evidence-lanes">
        <div className="section-title compact-title">
          <div>
            <p className="eyebrow">Evidence Mix</p>
            <h2>證據分布</h2>
          </div>
        </div>
        <div className="lane-grid">
          {eventGroups.map((group) => (
            <article key={group.id} className="evidence-lane">
              <header>
                <span>{group.label}</span>
                <strong>{group.events.length}</strong>
              </header>
              {group.events.length === 0 ? (
                <p className="muted">尚無事件</p>
              ) : (
                <ul>
                  {group.events.slice(0, 3).map((event) => (
                    <li key={event.id}>
                      <time>{formatTime(event.publishedAt)}</time>
                      <a href={event.url}>{event.title}</a>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="timeline">
        <div className="section-title">
          <p className="eyebrow">Evidence</p>
          <h2>事件時間線</h2>
        </div>
        {events.length === 0 ? (
          <p className="muted">目前沒有已同步事件。</p>
        ) : (
          <ol>
            {events.map((event) => (
              <li key={event.id}>
                <time>{formatTime(event.publishedAt)}</time>
                <div>
                  <div className="event-meta">
                    <span>{event.source}</span>
                    <span>{`情緒 ${event.sentiment}`}</span>
                    {event.tags.map((tag) => <span key={tag}>{tag}</span>)}
                  </div>
                  <strong>{event.title}</strong>
                  <p>{event.reason}</p>
                  <a href={event.url}>證據連結</a>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}

export interface ResearchEventGroup {
  id: "social" | "news" | "official" | "market" | "revenue";
  label: string;
  events: EventRecord[];
}

export interface MetricChip {
  key: string;
  label: string;
}

export function formatMetricChips(metrics: FinMindMetrics | undefined): MetricChip[] {
  if (!metrics) {
    return [];
  }
  const chips: MetricChip[] = [];
  if (metrics.revenueYoYPct !== undefined) {
    chips.push({ key: "revenueYoY", label: `YoY ${formatSignedPct(metrics.revenueYoYPct)}` });
  }
  if (metrics.revenueMoMPct !== undefined) {
    chips.push({ key: "revenueMoM", label: `MoM ${formatSignedPct(metrics.revenueMoMPct)}` });
  }
  if (metrics.priceChangePct !== undefined) {
    chips.push({ key: "priceChange", label: `漲跌 ${formatSignedPct(metrics.priceChangePct)}` });
  }
  if (metrics.volumeRatio !== undefined) {
    chips.push({ key: "volumeRatio", label: `量比 ${metrics.volumeRatio.toFixed(1)}x` });
  }
  if (metrics.liquidityTier !== undefined) {
    chips.push({ key: "liquidity", label: `流動性 ${metrics.liquidityTier}` });
  }
  if (metrics.isRecentHigh) {
    chips.push({ key: "recentHigh", label: "近期新高" });
  }
  return chips;
}

const RESEARCH_GROUPS: Array<Omit<ResearchEventGroup, "events">> = [
  { id: "social", label: "社群討論" },
  { id: "news", label: "新聞時事" },
  { id: "official", label: "官方重訊" },
  { id: "market", label: "價格/籌碼" },
  { id: "revenue", label: "營收基本面" }
];

export function groupResearchEvents(events: EventRecord[]): ResearchEventGroup[] {
  const groups = new Map<ResearchEventGroup["id"], EventRecord[]>(RESEARCH_GROUPS.map((group) => [group.id, []]));
  for (const event of events) {
    groups.get(researchGroupId(event))?.push(event);
  }

  return RESEARCH_GROUPS.map((group) => ({
    ...group,
    events: [...(groups.get(group.id) ?? [])].sort((left, right) => right.publishedAt.localeCompare(left.publishedAt))
  }));
}

export function summarizeResearch(events: EventRecord[]): { eventCount: number; sourceCount: number; averageSentiment: number; topTags: string[] } {
  const tags = events.flatMap((event) => event.tags);
  const tagCounts = new Map<string, number>();
  const tagOrder = new Map<string, number>();
  for (const [index, tag] of tags.entries()) {
    tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    if (!tagOrder.has(tag)) {
      tagOrder.set(tag, index);
    }
  }

  return {
    eventCount: events.length,
    sourceCount: new Set(events.map((event) => event.source)).size,
    averageSentiment: round(average(events.map((event) => event.sentiment))),
    topTags: [...tagCounts.entries()]
      .sort((left, right) => right[1] - left[1] || (tagOrder.get(left[0]) ?? 0) - (tagOrder.get(right[0]) ?? 0))
      .slice(0, 5)
      .map(([tag]) => tag)
  };
}

function researchGroupId(event: EventRecord): ResearchEventGroup["id"] {
  if (event.source === "ptt") {
    return "social";
  }
  if (event.source === "rss") {
    return "news";
  }
  if (event.source === "twse" || event.source === "mops") {
    return "official";
  }
  if (event.tags.includes("營收")) {
    return "revenue";
  }
  return "market";
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function formatSignedPct(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded.toFixed(1)}%`;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

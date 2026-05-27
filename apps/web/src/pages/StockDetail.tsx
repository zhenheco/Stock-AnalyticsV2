import type { EventRecord, UniverseStock } from "@stock-analytics/shared";

interface StockDetailProps {
  symbol: string;
  stock?: UniverseStock | null;
  events: EventRecord[];
}

export function StockDetail({ symbol, stock, events }: StockDetailProps) {
  const tradingViewSymbol = `TWSE:${symbol}`;
  const widgetUrl = `https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(tradingViewSymbol)}&interval=D&theme=dark`;

  return (
    <main className="detail-page">
      <header className="page-header compact">
        <div>
          <p className="eyebrow">STOCK RESEARCH</p>
          <h1>{stock?.name ? `${symbol} ${stock.name}` : symbol}</h1>
          {stock ? <p className="muted">{[stock.market, stock.industry, stock.securityType].filter(Boolean).join(" / ")}</p> : null}
        </div>
        <a className="ghost-button" href="/">回雷達</a>
      </header>

      <section className="chart-band">
        <div className="chart-copy">
          <p className="eyebrow">External Chart</p>
          <h2>TradingView {tradingViewSymbol}</h2>
          <p>圖表採外部 TradingView，MVP 不在 D1 儲存完整歷史股價，也不自刻 K 線。</p>
          <a href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tradingViewSymbol)}`}>開啟 TradingView</a>
        </div>
        <iframe title={`TradingView ${symbol}`} src={widgetUrl} loading="lazy" />
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

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

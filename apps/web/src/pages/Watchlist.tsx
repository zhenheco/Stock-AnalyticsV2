import type { WatchlistEntry } from "@stock-analytics/shared";

interface WatchlistProps {
  entries: WatchlistEntry[];
}

export function Watchlist({ entries }: WatchlistProps) {
  return (
    <main className="watchlist-page">
      <header className="page-header compact">
        <div>
          <p className="eyebrow">WATCHLIST</p>
          <h1>追蹤清單</h1>
        </div>
        <a className="ghost-button" href="/">回雷達</a>
      </header>

      <section className="watchlist-grid">
        {entries.length === 0 ? (
          <p className="muted">目前沒有追蹤股票。MVP 可先用 API 加入，後續再補互動表單。</p>
        ) : entries.map((entry) => (
          <a className="watch-row" key={entry.symbol} href={`/stock/${entry.symbol}`}>
            <strong>{entry.symbol}</strong>
            <span>{entry.name}</span>
            <time>{new Date(entry.addedAt).toLocaleDateString("zh-TW")}</time>
          </a>
        ))}
      </section>
    </main>
  );
}

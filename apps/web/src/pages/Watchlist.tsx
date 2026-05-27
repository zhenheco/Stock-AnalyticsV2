import type { WatchlistEntry } from "@stock-analytics/shared";
import { useState } from "react";

interface WatchlistProps {
  entries: WatchlistEntry[];
  onAdd?: (input: { symbol: string; name: string; adminToken: string }) => Promise<void>;
}

export function Watchlist({ entries, onAdd }: WatchlistProps) {
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [adminToken, setAdminToken] = useState(() => {
    if (typeof window === "undefined") {
      return "";
    }
    return window.localStorage.getItem("stock-analytics-admin-token") ?? "";
  });
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("stock-analytics-admin-token", adminToken);
    }
    try {
      await onAdd?.({ symbol: symbol.trim(), name: name.trim(), adminToken });
      setSymbol("");
      setName("");
      setMessage("已加入追蹤清單");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "新增失敗");
    }
  }

  return (
    <main className="watchlist-page">
      <header className="page-header compact">
        <div>
          <p className="eyebrow">WATCHLIST</p>
          <h1>追蹤清單</h1>
        </div>
        <a className="ghost-button" href="/">回雷達</a>
      </header>

      <form className="watchlist-form" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="watch-symbol">股票代號</label>
          <input id="watch-symbol" value={symbol} onChange={(event) => setSymbol(event.target.value)} placeholder="2330" required />
        </div>
        <div>
          <label htmlFor="watch-name">公司名稱</label>
          <input id="watch-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="台積電" required />
        </div>
        <div>
          <label htmlFor="watch-token">管理 Token</label>
          <input id="watch-token" type="password" value={adminToken} onChange={(event) => setAdminToken(event.target.value)} placeholder="x-admin-token" required />
        </div>
        <button type="submit">新增追蹤</button>
        {message ? <p className="form-message">{message}</p> : null}
      </form>

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

import type { WatchlistEntry } from "@stock-analytics/shared";
import { useState } from "react";
import { readStoredAdminToken, storeAdminToken } from "../adminToken";

interface WatchlistProps {
  entries: WatchlistEntry[];
  onAdd?: (input: { symbol: string; name?: string; note?: string; tags?: string[]; alertThreshold?: number; adminToken: string }) => Promise<void>;
  onRemove?: (input: { symbol: string; adminToken: string }) => Promise<void>;
}

export function Watchlist({ entries, onAdd, onRemove }: WatchlistProps) {
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [tags, setTags] = useState("");
  const [alertThreshold, setAlertThreshold] = useState("");
  const [adminToken, setAdminToken] = useState(() => readStoredAdminToken());
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    storeAdminToken(adminToken);
    try {
      await onAdd?.({
        symbol: symbol.trim(),
        name: name.trim(),
        note: note.trim(),
        tags: parseTags(tags),
        ...(alertThreshold ? { alertThreshold: Number(alertThreshold) } : {}),
        adminToken
      });
      setSymbol("");
      setName("");
      setNote("");
      setTags("");
      setAlertThreshold("");
      setMessage("已加入追蹤清單");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "新增失敗");
    }
  }

  async function handleRemove(symbol: string) {
    setMessage(null);
    storeAdminToken(adminToken);
    try {
      await onRemove?.({ symbol, adminToken });
      setMessage("已移除追蹤");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "移除失敗");
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
          <label htmlFor="watch-name">公司名稱（選填）</label>
          <input id="watch-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="留空自動帶股票主檔" />
        </div>
        <div>
          <label htmlFor="watch-note">研究筆記</label>
          <input id="watch-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="觀察題材、風險或等待確認的事件" />
        </div>
        <div>
          <label htmlFor="watch-tags">標籤</label>
          <input id="watch-tags" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="AI, 半導體, 觀察" />
        </div>
        <div>
          <label htmlFor="watch-alert">提醒門檻</label>
          <input id="watch-alert" inputMode="decimal" value={alertThreshold} onChange={(event) => setAlertThreshold(event.target.value)} placeholder="8" />
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
          <div className="watch-row" key={entry.symbol}>
            <a href={`/stock/${entry.symbol}`}>
              <strong>{entry.symbol}</strong>
              <span>{entry.name}</span>
            </a>
            {entry.note ? <p>{entry.note}</p> : null}
            {entry.tags && entry.tags.length > 0 ? (
              <div className="tag-list">
                {entry.tags.map((tag) => <span key={tag}>{tag}</span>)}
              </div>
            ) : null}
            {entry.alertThreshold !== undefined ? <small>{`提醒門檻 ${entry.alertThreshold}`}</small> : null}
            <time>{new Date(entry.addedAt).toLocaleDateString("zh-TW")}</time>
            {onRemove ? <button type="button" onClick={() => void handleRemove(entry.symbol)}>移除</button> : null}
          </div>
        ))}
      </section>
    </main>
  );
}

function parseTags(value: string): string[] {
  return value
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 6);
}

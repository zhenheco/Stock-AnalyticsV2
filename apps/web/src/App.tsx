import { useEffect, useMemo, useState } from "react";
import type { Candidate, EventRecord, WatchlistEntry } from "@stock-analytics/shared";
import { fetchCandidates, fetchStockResearch, fetchWatchlist } from "./api";
import { RadarTable } from "./components/RadarTable";
import { StockDetail } from "./pages/StockDetail";
import { Watchlist } from "./pages/Watchlist";

type LoadState<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: T };

export function App() {
  const path = window.location.pathname;
  const stockMatch = path.match(/^\/stock\/([^/]+)$/);

  if (stockMatch?.[1]) {
    return <StockRoute symbol={stockMatch[1].toUpperCase()} />;
  }

  if (path === "/watchlist") {
    return <WatchlistRoute />;
  }

  return <RadarRoute />;
}

function RadarRoute() {
  const [state, setState] = useState<LoadState<{ candidates: Candidate[]; updatedAt: string | null }>>({ status: "loading" });

  useEffect(() => {
    fetchCandidates()
      .then((data) => setState({ status: "ready", data }))
      .catch((error: unknown) => setState({ status: "error", message: error instanceof Error ? error.message : "資料讀取失敗" }));
  }, []);

  const candidates = state.status === "ready" ? state.data.candidates : [];
  const updatedAt = state.status === "ready" ? state.data.updatedAt : null;

  return (
    <main>
      <header className="hero-band">
        <nav>
          <a href="/">雷達</a>
          <a href="/watchlist">追蹤清單</a>
        </nav>
        <div className="hero-grid">
          <div>
            <p className="eyebrow">TAIWAN EVENT RADAR</p>
            <h1>台股事件選股雷達</h1>
            <p>把 PTT、RSS、FinMind 的短訊號壓成可掃描候選股，先回答為什麼浮上來，不給買賣價位。</p>
          </div>
          <div className="status-board" aria-label="system status">
            <span>資料更新</span>
            <strong>{updatedAt ? formatTime(updatedAt) : "等待同步"}</strong>
            <span>候選數</span>
            <strong>{candidates.length}</strong>
          </div>
        </div>
      </header>

      <section className="content-band">
        <div className="section-title">
          <p className="eyebrow">Candidates</p>
          <h2>事件候選股</h2>
        </div>
        {state.status === "loading" ? <SkeletonTable /> : null}
        {state.status === "error" ? <ErrorPanel message={state.message} /> : null}
        {state.status === "ready" ? <RadarTable candidates={candidates} /> : null}
      </section>
    </main>
  );
}

function StockRoute({ symbol }: { symbol: string }) {
  const [state, setState] = useState<LoadState<{ events: EventRecord[] }>>({ status: "loading" });

  useEffect(() => {
    fetchStockResearch(symbol)
      .then((data) => setState({ status: "ready", data: { events: data.events } }))
      .catch((error: unknown) => setState({ status: "error", message: error instanceof Error ? error.message : "資料讀取失敗" }));
  }, [symbol]);

  const events = state.status === "ready" ? state.data.events : [];
  return (
    <>
      {state.status === "error" ? <ErrorPanel message={state.message} /> : null}
      <StockDetail symbol={symbol} events={events} />
    </>
  );
}

function WatchlistRoute() {
  const [state, setState] = useState<LoadState<{ watchlist: WatchlistEntry[] }>>({ status: "loading" });

  useEffect(() => {
    fetchWatchlist()
      .then((data) => setState({ status: "ready", data }))
      .catch((error: unknown) => setState({ status: "error", message: error instanceof Error ? error.message : "資料讀取失敗" }));
  }, []);

  return (
    <>
      {state.status === "error" ? <ErrorPanel message={state.message} /> : null}
      <Watchlist entries={state.status === "ready" ? state.data.watchlist : []} />
    </>
  );
}

function SkeletonTable() {
  return (
    <div className="skeleton-table" aria-label="loading candidates">
      {Array.from({ length: 5 }).map((_, index) => <span key={index} />)}
    </div>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <section className="error-panel">
      <strong>資料讀取失敗</strong>
      <p>{message}</p>
    </section>
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

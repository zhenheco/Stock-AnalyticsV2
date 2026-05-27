import { useEffect, useMemo, useState } from "react";
import type { Candidate, EventRecord, SourceRun, UniverseStock, WatchlistEntry } from "@stock-analytics/shared";
import { addWatchlistEntry, fetchCandidates, fetchSourceRuns, fetchStockResearch, fetchUniverse, fetchWatchlist } from "./api";
import { RadarTable } from "./components/RadarTable";
import { SourceHealth } from "./components/SourceHealth";
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
  const [state, setState] = useState<LoadState<{ candidates: Candidate[]; updatedAt: string | null; runs: SourceRun[]; universeCount: number }>>({ status: "loading" });

  useEffect(() => {
    Promise.all([fetchCandidates(), fetchSourceRuns(), fetchUniverse()])
      .then(([candidateData, healthData, universeData]) => setState({
        status: "ready",
        data: { ...candidateData, runs: healthData.runs, universeCount: universeData.count }
      }))
      .catch((error: unknown) => setState({ status: "error", message: error instanceof Error ? error.message : "資料讀取失敗" }));
  }, []);

  const candidates = state.status === "ready" ? state.data.candidates : [];
  const updatedAt = state.status === "ready" ? state.data.updatedAt : null;
  const runs = state.status === "ready" ? state.data.runs : [];
  const universeCount = state.status === "ready" ? state.data.universeCount : 0;

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
            <span>股票主檔</span>
            <strong>{universeCount}</strong>
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
        {state.status === "ready" ? (
          <>
            <SourceHealth runs={runs} />
            <RadarTable candidates={candidates} />
          </>
        ) : null}
      </section>
    </main>
  );
}

function StockRoute({ symbol }: { symbol: string }) {
  const [state, setState] = useState<LoadState<{ stock: UniverseStock | null; events: EventRecord[] }>>({ status: "loading" });

  useEffect(() => {
    fetchStockResearch(symbol)
      .then((data) => setState({ status: "ready", data: { stock: data.stock, events: data.events } }))
      .catch((error: unknown) => setState({ status: "error", message: error instanceof Error ? error.message : "資料讀取失敗" }));
  }, [symbol]);

  const events = state.status === "ready" ? state.data.events : [];
  const stock = state.status === "ready" ? state.data.stock : null;
  return (
    <>
      {state.status === "error" ? <ErrorPanel message={state.message} /> : null}
      <StockDetail symbol={symbol} stock={stock} events={events} />
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

  async function handleAdd(input: { symbol: string; name: string; adminToken: string }) {
    const entry = await addWatchlistEntry(input);
    setState((current) => {
      if (current.status !== "ready") {
        return current;
      }
      const withoutDuplicate = current.data.watchlist.filter((item) => item.symbol !== entry.symbol);
      return { status: "ready", data: { watchlist: [...withoutDuplicate, entry].sort((left, right) => left.symbol.localeCompare(right.symbol)) } };
    });
  }

  return (
    <>
      {state.status === "error" ? <ErrorPanel message={state.message} /> : null}
      <Watchlist entries={state.status === "ready" ? state.data.watchlist : []} onAdd={handleAdd} />
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

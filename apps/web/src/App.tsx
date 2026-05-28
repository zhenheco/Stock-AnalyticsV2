import { useEffect, useState } from "react";
import type { Candidate, DailySnapshot, DataReadiness, EventRecord, SourceRun, UniverseStock, WatchlistEntry } from "@stock-analytics/shared";
import { addWatchlistEntry, fetchCandidates, fetchDataReadiness, fetchSnapshots, fetchSourceRuns, fetchStockResearch, fetchUniverse, fetchWatchlist, removeWatchlistEntry, triggerAdminIngest, triggerAdminScore } from "./api";
import { readStoredAdminToken } from "./adminToken";
import { AdminRefreshPanel } from "./components/AdminRefreshPanel";
import { DataReadinessPanel } from "./components/DataReadinessPanel";
import { RadarTable, type RadarFilters } from "./components/RadarTable";
import { ResearchOnlyNotice } from "./components/ResearchOnlyNotice";
import { SnapshotPanel } from "./components/SnapshotPanel";
import { SourceHealth } from "./components/SourceHealth";
import { WatchlistAlerts } from "./components/WatchlistAlerts";
import { FriendTest } from "./pages/FriendTest";
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

  if (path === "/friend-test") {
    return <FriendTest />;
  }

  return <RadarRoute />;
}

type DashboardData = { candidates: Candidate[]; updatedAt: string | null; runs: SourceRun[]; universeCount: number; watchlist: WatchlistEntry[]; readiness: DataReadiness; snapshots: DailySnapshot[] };

function RadarRoute() {
  const [state, setState] = useState<LoadState<DashboardData>>({ status: "loading" });
  const [filters, setFilters] = useState<RadarFilters>({ minScore: 0, source: "all", tag: "all", sort: "score", watchlistOnly: false });

  useEffect(() => {
    loadDashboardData()
      .then((data) => setState({ status: "ready", data }))
      .catch((error: unknown) => setState({ status: "error", message: error instanceof Error ? error.message : "資料讀取失敗" }));
  }, []);

  const candidates = state.status === "ready" ? state.data.candidates : [];
  const updatedAt = state.status === "ready" ? state.data.updatedAt : null;
  const runs = state.status === "ready" ? state.data.runs : [];
  const universeCount = state.status === "ready" ? state.data.universeCount : 0;
  const watchlistSymbols = new Set(state.status === "ready" ? state.data.watchlist.map((item) => item.symbol) : []);

  async function handleManualRefresh(adminToken: string) {
    const result = await triggerAdminIngest(adminToken);
    const data = await loadDashboardData();
    setState({ status: "ready", data });
    return result;
  }

  async function handleManualScore(adminToken: string) {
    const result = await triggerAdminScore(adminToken);
    const data = await loadDashboardData();
    setState({ status: "ready", data });
    return result;
  }

  async function handleAddCandidateToWatchlist(candidate: Candidate) {
    const adminToken = readStoredAdminToken() || window.prompt("Admin token")?.trim() || "";
    if (!adminToken) {
      return;
    }
    const entry = await addWatchlistEntry({ symbol: candidate.symbol, name: candidate.name, adminToken });
    setState((current) => {
      if (current.status !== "ready") {
        return current;
      }
      return {
        status: "ready",
        data: {
          ...current.data,
          watchlist: mergeWatchlistEntry(current.data.watchlist, entry)
        }
      };
    });
  }

  return (
    <main>
      <header className="hero-band">
        <nav>
          <a href="/">雷達</a>
          <a href="/friend-test">朋友測試</a>
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
            <ResearchOnlyNotice />
            <SourceHealth runs={runs} />
            <DataReadinessPanel readiness={state.data.readiness} />
            <WatchlistAlerts entries={state.data.watchlist} candidates={candidates} />
            <SnapshotPanel snapshots={state.data.snapshots} />
            <AdminRefreshPanel onRefresh={handleManualRefresh} onScore={handleManualScore} />
            <RadarTable
              candidates={candidates}
              filters={filters}
              onAddToWatchlist={handleAddCandidateToWatchlist}
              onFiltersChange={setFilters}
              watchlistSymbols={watchlistSymbols}
            />
          </>
        ) : null}
      </section>
    </main>
  );
}

export function mergeWatchlistEntry(entries: WatchlistEntry[], entry: WatchlistEntry): WatchlistEntry[] {
  const withoutDuplicate = entries.filter((item) => item.symbol !== entry.symbol);
  return [...withoutDuplicate, entry].sort((left, right) => left.symbol.localeCompare(right.symbol));
}

async function loadDashboardData(): Promise<DashboardData> {
  const [candidateData, healthData, universeData, watchlistData, readiness, snapshotData] = await Promise.all([fetchCandidates(), fetchSourceRuns(), fetchUniverse(), fetchWatchlist(), fetchDataReadiness(), fetchSnapshots()]);
  return {
    ...candidateData,
    runs: healthData.runs,
    universeCount: universeData.count,
    watchlist: watchlistData.watchlist,
    readiness,
    snapshots: snapshotData.snapshots
  };
}

function StockRoute({ symbol }: { symbol: string }) {
  const [state, setState] = useState<LoadState<{ stock: UniverseStock | null; events: EventRecord[]; watchlist: WatchlistEntry[] }>>({ status: "loading" });

  useEffect(() => {
    Promise.all([fetchStockResearch(symbol), fetchWatchlist()])
      .then(([research, watchlistData]) => setState({ status: "ready", data: { stock: research.stock, events: research.events, watchlist: watchlistData.watchlist } }))
      .catch((error: unknown) => setState({ status: "error", message: error instanceof Error ? error.message : "資料讀取失敗" }));
  }, [symbol]);

  const events = state.status === "ready" ? state.data.events : [];
  const stock = state.status === "ready" ? state.data.stock : null;
  const isWatchlisted = state.status === "ready" ? state.data.watchlist.some((entry) => entry.symbol === symbol) : false;

  async function handleAddToWatchlist() {
    const adminToken = readStoredAdminToken() || window.prompt("Admin token")?.trim() || "";
    if (!adminToken) {
      return;
    }
    const entry = await addWatchlistEntry({ symbol, name: stock?.name ?? symbol, adminToken });
    setState((current) => {
      if (current.status !== "ready") {
        return current;
      }
      return { status: "ready", data: { ...current.data, watchlist: mergeWatchlistEntry(current.data.watchlist, entry) } };
    });
  }

  async function handleRemoveFromWatchlist() {
    const adminToken = readStoredAdminToken() || window.prompt("Admin token")?.trim() || "";
    if (!adminToken) {
      return;
    }
    await removeWatchlistEntry({ symbol, adminToken });
    setState((current) => {
      if (current.status !== "ready") {
        return current;
      }
      return { status: "ready", data: { ...current.data, watchlist: current.data.watchlist.filter((entry) => entry.symbol !== symbol) } };
    });
  }

  return (
    <>
      {state.status === "error" ? <ErrorPanel message={state.message} /> : null}
      <StockDetail
        symbol={symbol}
        stock={stock}
        events={events}
        isWatchlisted={isWatchlisted}
        onAddToWatchlist={handleAddToWatchlist}
        onRemoveFromWatchlist={handleRemoveFromWatchlist}
      />
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

  async function handleAdd(input: { symbol: string; name?: string; note?: string; tags?: string[]; alertThreshold?: number; adminToken: string }) {
    const entry = await addWatchlistEntry(input);
    setState((current) => {
      if (current.status !== "ready") {
        return current;
      }
      return { status: "ready", data: { watchlist: mergeWatchlistEntry(current.data.watchlist, entry) } };
    });
  }

  async function handleRemove(input: { symbol: string; adminToken: string }) {
    await removeWatchlistEntry(input);
    setState((current) => {
      if (current.status !== "ready") {
        return current;
      }
      return { status: "ready", data: { watchlist: current.data.watchlist.filter((item) => item.symbol !== input.symbol) } };
    });
  }

  return (
    <>
      {state.status === "error" ? <ErrorPanel message={state.message} /> : null}
      <Watchlist entries={state.status === "ready" ? state.data.watchlist : []} onAdd={handleAdd} onRemove={handleRemove} />
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

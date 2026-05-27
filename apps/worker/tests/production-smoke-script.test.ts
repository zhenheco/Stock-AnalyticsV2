import { describe, expect, it } from "vitest";
import { productionSmokeGate, summarizeProductionSmoke } from "../../../scripts/production-smoke.mjs";

describe("production-smoke script helpers", () => {
  it("summarizes ingestion, readiness, source runs, and top candidate evidence", () => {
    expect(summarizeProductionSmoke({
      ingest: { candidateCount: 100 },
      readiness: {
        status: "degraded",
        counts: { candidates: 100, universe: 3059, watchlist: 0 },
        checks: [
          { id: "social-events", status: "ready", message: "PTT 與 RSS 來源最近一次同步正常" },
          { id: "official-events", status: "ready", message: "TWSE 官方 OpenAPI newsList 最近一次同步正常" },
          { id: "finmind-signals", status: "degraded", message: "anonymous mode" }
        ]
      },
      sourceRuns: {
        runs: [
          { source: "twse", status: "ok", startedAt: "2026-05-28T00:00:00.000+08:00", itemCount: 326 },
          { source: "rss", status: "ok", startedAt: "2026-05-28T00:00:00.000+08:00", itemCount: 90 },
          { source: "ptt", status: "ok", startedAt: "2026-05-28T00:00:00.000+08:00", itemCount: 20 },
          { source: "finmind", status: "partial", startedAt: "2026-05-28T00:00:00.000+08:00", itemCount: 4294 }
        ]
      },
      candidates: {
        updatedAt: "2026-05-28T00:00:00.000+08:00",
        candidates: [{
          symbol: "2330",
          name: "台積電",
          sourceEventCounts: { finmind: 7, rss: 9, ptt: 6, twse: 1 }
        }]
      }
    })).toEqual([
      "INGEST candidateCount=100",
      "READINESS status=degraded candidates=100 universe=3059",
      "SOURCE_RUNS ptt=ok:20 rss=ok:90 twse=ok:326 finmind=partial:4294",
      "TOP_CANDIDATE symbol=2330 name=台積電 sourceEventCounts=finmind:7,rss:9,ptt:6,twse:1"
    ]);
  });

  it("passes when required tokenless source runs and candidates are present", () => {
    expect(productionSmokeGate({
      ingest: { candidateCount: 100 },
      readiness: {
        status: "degraded",
        counts: { candidates: 100, universe: 3059, watchlist: 0 },
        checks: [
          { id: "social-events", status: "ready", message: "ok" },
          { id: "official-events", status: "ready", message: "ok" },
          { id: "finmind-signals", status: "degraded", message: "anonymous mode" }
        ]
      },
      sourceRuns: {
        runs: [
          { source: "ptt", status: "ok", itemCount: 20 },
          { source: "rss", status: "ok", itemCount: 90 },
          { source: "twse", status: "ok", itemCount: 326 },
          { source: "finmind", status: "partial", itemCount: 4294 }
        ]
      },
      candidates: {
        candidates: [{
          symbol: "2330",
          name: "台積電",
          sourceEventCounts: { ptt: 6, rss: 9, twse: 1, finmind: 7 }
        }]
      }
    })).toEqual({ ok: true, reasons: [] });
  });

  it("fails when a required tokenless source run is missing", () => {
    expect(productionSmokeGate({
      ingest: { candidateCount: 100 },
      readiness: {
        status: "degraded",
        counts: { candidates: 100, universe: 3059, watchlist: 0 },
        checks: [
          { id: "social-events", status: "ready", message: "ok" },
          { id: "official-events", status: "ready", message: "ok" }
        ]
      },
      sourceRuns: {
        runs: [
          { source: "ptt", status: "ok", itemCount: 20 },
          { source: "rss", status: "failed", itemCount: 0 },
          { source: "finmind", status: "partial", itemCount: 4294 }
        ]
      },
      candidates: { candidates: [] }
    })).toEqual({
      ok: false,
      reasons: [
        "top candidate missing",
        "rss source run not ok",
        "twse source run not ok"
      ]
    });
  });
});

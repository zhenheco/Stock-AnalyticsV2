import { describe, expect, it } from "vitest";
import { productionHealthGate, summarizeProductionHealth } from "../../../scripts/production-health.mjs";

describe("production-health script helpers", () => {
  it("summarizes production health without exposing secrets", () => {
    const secret = "finmind-secret-token";

    expect(summarizeProductionHealth({
      page: {
        status: 200,
        html: "<script src=\"/assets/index-abc123.js\"></script><link rel=\"stylesheet\" href=\"/assets/index-def456.css\">"
      },
      readiness: {
        status: "degraded",
        counts: {
          candidates: 100,
          universe: 3059,
          watchlist: 2
        },
        checks: [
          { id: "universe", status: "ready", message: "3059 檔股票主檔已可用" },
          { id: "candidates", status: "ready", message: "100 檔候選股已產出" },
          { id: "social-events", status: "ready", message: "PTT 與 RSS 來源最近一次同步正常" },
          { id: "finmind-signals", status: "degraded", message: "設定 FINMIND_TOKEN 可提高額度穩定性" }
        ]
      },
      candidates: {
        updatedAt: "2026-05-27T15:14:34.402Z",
        candidates: [{
          symbol: "2330",
          name: "台積電",
          sourceEventCounts: {
            finmind: 7,
            rss: 9,
            ptt: 6
          }
        }]
      },
      finmindToken: secret
    })).toEqual([
      "PAGES status=200 bundle=assets/index-abc123.js css=assets/index-def456.css",
      "READINESS status=degraded completion=75% candidates=100 universe=3059 watchlist=2",
      "CHECKS universe=ready candidates=ready social-events=ready finmind-signals=degraded",
      "TOP_CANDIDATE symbol=2330 name=台積電 updatedAt=2026-05-27T15:14:34.402Z sourceEventCounts=finmind:7,rss:9,ptt:6",
      "FINMIND_TOKEN_PRESENT length=20"
    ]);
  });

  it("reports missing candidate source counts as an explicit gap", () => {
    expect(summarizeProductionHealth({
      page: {
        status: 200,
        html: "<script src=\"/assets/index-abc123.js\"></script>"
      },
      readiness: {
        status: "ready",
        counts: {
          candidates: 1,
          universe: 3059,
          watchlist: 0
        },
        checks: [
          { id: "universe", status: "ready", message: "ok" }
        ]
      },
      candidates: {
        updatedAt: "2026-05-27T15:14:34.402Z",
        candidates: [{ symbol: "2330", name: "台積電" }]
      },
      finmindToken: ""
    })).toContain("TOP_CANDIDATE symbol=2330 name=台積電 updatedAt=2026-05-27T15:14:34.402Z sourceEventCounts=missing");
  });

  it("passes strict production gate only when readiness is ready and source counts exist", () => {
    expect(productionHealthGate({
      page: {
        status: 200,
        html: "<script src=\"/assets/index-abc123.js\"></script><link rel=\"stylesheet\" href=\"/assets/index-def456.css\">"
      },
      readiness: {
        status: "ready",
        counts: {
          candidates: 100,
          universe: 3059,
          watchlist: 0
        },
        checks: [
          { id: "universe", status: "ready", message: "ok" },
          { id: "candidates", status: "ready", message: "ok" }
        ]
      },
      candidates: {
        updatedAt: "2026-05-27T15:14:34.402Z",
        candidates: [{
          symbol: "2330",
          name: "台積電",
          sourceEventCounts: { finmind: 7, rss: 9, ptt: 6 }
        }]
      },
      finmindToken: "finmind-secret-token"
    })).toEqual({ ok: true, reasons: [] });
  });

  it("fails strict production gate when readiness is degraded", () => {
    expect(productionHealthGate({
      page: {
        status: 200,
        html: "<script src=\"/assets/index-abc123.js\"></script><link rel=\"stylesheet\" href=\"/assets/index-def456.css\">"
      },
      readiness: {
        status: "degraded",
        counts: {
          candidates: 100,
          universe: 3059,
          watchlist: 0
        },
        checks: [
          { id: "universe", status: "ready", message: "ok" },
          { id: "finmind-signals", status: "degraded", message: "token missing" }
        ]
      },
      candidates: {
        updatedAt: "2026-05-27T15:14:34.402Z",
        candidates: [{
          symbol: "2330",
          name: "台積電",
          sourceEventCounts: { finmind: 7, rss: 9, ptt: 6 }
        }]
      },
      finmindToken: ""
    })).toEqual({
      ok: false,
      reasons: [
        "readiness=degraded",
        "finmind-signals=degraded",
        "FINMIND_TOKEN missing"
      ]
    });
  });
});

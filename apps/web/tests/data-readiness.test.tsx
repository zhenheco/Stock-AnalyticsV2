import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DataReadinessPanel } from "../src/components/DataReadinessPanel";

describe("DataReadinessPanel", () => {
  it("renders degraded FinMind readiness as an actionable dashboard gap", () => {
    const html = renderToString(<DataReadinessPanel readiness={{
      status: "degraded",
      updatedAt: "2026-05-27T10:00:00.000Z",
      counts: {
        candidates: 100,
        universe: 4114,
        watchlist: 2
      },
      checks: [
        { id: "social-events", label: "社群/時事", status: "ready", message: "PTT 與 RSS 來源最近一次同步正常" },
        { id: "finmind-signals", label: "FinMind 價格/籌碼", status: "missing", message: "FINMIND_TOKEN 尚未設定，價格與籌碼資料未進入事件管線" }
      ]
    }} />);

    expect(html).toContain("資料接線狀態");
    expect(html).toContain("降級");
    expect(html).toContain("FinMind 價格/籌碼");
    expect(html).toContain("FINMIND_TOKEN 尚未設定");
  });
});

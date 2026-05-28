import type { Candidate, WatchlistEntry } from "@stock-analytics/shared";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WatchlistAlerts, watchlistAlerts } from "../src/components/WatchlistAlerts";

const baseCandidate: Candidate = {
  symbol: "2330",
  name: "台積電",
  score: 9.2,
  eventCount: 3,
  sourceCount: 2,
  latestTitle: "台積電先進製程需求升溫",
  latestAt: "2026-05-28T08:30:00.000Z",
  sources: ["rss", "ptt"],
  tags: ["AI", "半導體"],
  reason: "多來源事件同步升溫"
};

const baseEntry: WatchlistEntry = {
  symbol: "2330",
  name: "台積電",
  addedAt: "2026-05-27T00:00:00.000Z",
  note: "觀察 AI 需求",
  tags: ["核心持股"],
  alertThreshold: 8,
  lastSeenEventAt: "2026-05-28T07:00:00.000Z"
};

describe("WatchlistAlerts", () => {
  it("returns watchlist candidates with new events or threshold hits", () => {
    const alerts = watchlistAlerts([baseEntry], [baseCandidate]);

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      symbol: "2330",
      name: "台積電",
      isNewEvent: true,
      thresholdHit: true
    });
  });

  it("renders alert cards with threshold and new-event evidence", () => {
    const html = renderToString(<WatchlistAlerts entries={[baseEntry]} candidates={[baseCandidate]} />);

    expect(html).toContain("追蹤提醒");
    expect(html).toContain("2330");
    expect(html).toContain("台積電");
    expect(html).toContain("分數 9.2 已達門檻 8.0");
    expect(html).toContain("有新事件");
    expect(html).toContain("觀察 AI 需求");
  });

  it("renders an empty state when tracked symbols are quiet", () => {
    const quietCandidate = { ...baseCandidate, score: 6.1, latestAt: "2026-05-28T06:30:00.000Z" };
    const html = renderToString(<WatchlistAlerts entries={[baseEntry]} candidates={[quietCandidate]} />);

    expect(html).toContain("追蹤清單目前沒有新事件或達門檻標的");
  });
});

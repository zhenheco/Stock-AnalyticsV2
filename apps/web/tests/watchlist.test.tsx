import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Watchlist } from "../src/pages/Watchlist";

describe("Watchlist", () => {
  it("renders an add form for personal tracked symbols", () => {
    const html = renderToString(<Watchlist entries={[]} />);

    expect(html).toContain("新增追蹤");
    expect(html).toContain("股票代號");
    expect(html).toContain("公司名稱（選填）");
    expect(html).toContain("管理 Token");
  });

  it("renders remove actions for tracked symbols", () => {
    const html = renderToString(<Watchlist
      entries={[
        { symbol: "2330", name: "台積電", addedAt: "2026-05-27T00:00:00.000Z" }
      ]}
      onRemove={async () => undefined}
    />);

    expect(html).toContain("2330");
    expect(html).toContain("移除");
  });

  it("renders research notes, tags, and alert threshold for tracked symbols", () => {
    const html = renderToString(<Watchlist
      entries={[
        {
          symbol: "2330",
          name: "台積電",
          addedAt: "2026-05-27T00:00:00.000Z",
          note: "觀察 AI 需求與先進封裝",
          tags: ["AI", "半導體"],
          alertThreshold: 8
        }
      ]}
    />);

    expect(html).toContain("觀察 AI 需求與先進封裝");
    expect(html).toContain("AI");
    expect(html).toContain("半導體");
    expect(html).toContain("提醒門檻 8");
  });
});

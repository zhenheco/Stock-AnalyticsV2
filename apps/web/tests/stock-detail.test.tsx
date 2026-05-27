import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StockDetail } from "../src/pages/StockDetail";

describe("StockDetail", () => {
  it("renders an external TradingView link instead of a custom chart", () => {
    const html = renderToString(<StockDetail symbol="2330" events={[]} />);

    expect(html).toContain("TradingView");
    expect(html).toContain("TWSE:2330");
  });

  it("renders connected universe metadata when available", () => {
    const html = renderToString(<StockDetail
      symbol="2330"
      stock={{
        symbol: "2330",
        name: "台積電",
        market: "上市",
        industry: "半導體業",
        securityType: "stock",
        updatedAt: "2026-05-27T05:00:00.000Z"
      }}
      events={[]}
    />);

    expect(html).toContain("2330 台積電");
    expect(html).toContain("半導體業");
  });
});

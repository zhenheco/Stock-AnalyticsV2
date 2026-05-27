import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StockDetail } from "../src/pages/StockDetail";

describe("StockDetail", () => {
  it("renders an external TradingView link instead of a custom chart", () => {
    const html = renderToString(<StockDetail symbol="2330" events={[]} />);

    expect(html).toContain("TradingView");
    expect(html).toContain("TWSE:2330");
  });
});

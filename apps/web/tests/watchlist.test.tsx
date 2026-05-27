import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Watchlist } from "../src/pages/Watchlist";

describe("Watchlist", () => {
  it("renders an add form for personal tracked symbols", () => {
    const html = renderToString(<Watchlist entries={[]} />);

    expect(html).toContain("新增追蹤");
    expect(html).toContain("股票代號");
    expect(html).toContain("管理 Token");
  });
});

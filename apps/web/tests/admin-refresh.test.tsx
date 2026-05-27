import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminRefreshPanel } from "../src/components/AdminRefreshPanel";

describe("AdminRefreshPanel", () => {
  it("renders a manual ingestion control without exposing a stored token", () => {
    const html = renderToString(<AdminRefreshPanel onRefresh={async () => ({ candidateCount: 0 })} />);

    expect(html).toContain("手動同步");
    expect(html).toContain("Admin token");
    expect(html).toContain("同步資料");
    expect(html).toContain("type=\"password\"");
    expect(html).not.toContain("op://");
  });
});

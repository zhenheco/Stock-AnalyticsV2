import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResearchOnlyNotice } from "../src/components/ResearchOnlyNotice";

describe("ResearchOnlyNotice", () => {
  it("states that the radar is for research and not trading advice", () => {
    const html = renderToString(<ResearchOnlyNotice />);

    expect(html).toContain("研究用途");
    expect(html).toContain("不是買賣建議");
    expect(html).toContain("不提供進出場");
    expect(html).toContain("停損停利");
  });
});

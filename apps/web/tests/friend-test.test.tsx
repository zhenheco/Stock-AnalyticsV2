import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FriendTest } from "../src/pages/FriendTest";

describe("FriendTest", () => {
  it("renders a public read-only testing brief for friends", () => {
    const html = renderToString(<FriendTest />);

    expect(html).toContain("朋友測試入口");
    expect(html).toContain("不用登入");
    expect(html).toContain("不要填管理 Token");
    expect(html).toContain("測試任務");
    expect(html).toContain("打開事件雷達");
    expect(html).toContain("查看一檔股票研究頁");
  });
});

import { describe, expect, it } from "vitest";
import { extractMentionedSymbols } from "../src/entity";

describe("extractMentionedSymbols", () => {
  it("extracts Taiwan stock codes from text and removes duplicates", () => {
    const symbols = extractMentionedSymbols("台積電 2330 爆量，2330 又被提到，0050 也在名單");

    expect(symbols).toEqual(["2330", "0050"]);
  });

  it("maps common company aliases to stock symbols", () => {
    const symbols = extractMentionedSymbols("台積電、鴻海、聯發科都出現在新聞標題");

    expect(symbols).toEqual(["2330", "2317", "2454"]);
  });

  it("does not treat dates in titles as stock mentions", () => {
    const symbols = extractMentionedSymbols("[閒聊] 2026/05/27 盤中閒聊；板規 v4.6 (2024/07/02 修正)");

    expect(symbols).toEqual([]);
  });

  it("prefers longer overlapping aliases to avoid false company matches", () => {
    const symbols = extractMentionedSymbols("大摩喊聯發科目標價上修", {
      聯發: "1459",
      聯發科: "2454"
    });

    expect(symbols).toEqual(["2454"]);
  });
});

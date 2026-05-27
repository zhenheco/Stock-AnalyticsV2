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
});

import { describe, expect, it } from "vitest";
import { createWorkersAiClassifier, parseClassifierLimit } from "../src/classifier";

describe("createWorkersAiClassifier", () => {
  it("accepts JSON wrapped in a model code fence", async () => {
    const classifier = createWorkersAiClassifier({
      run: async () => ({
        response: "```json\n{\"sentiment\":5,\"tags\":[\"AI\",\"供應鏈\"],\"reason\":\"AI 訂單升溫\"}\n```"
      })
    });

    await expect(classifier.classify({
      source: "rss",
      title: "台積電 2330 AI 訂單升溫",
      engagement: 0
    })).resolves.toEqual({
      sentiment: 5,
      tags: ["AI", "供應鏈"],
      reason: "AI 訂單升溫"
    });
  });

  it("keeps only supported event category tags from model output", async () => {
    const classifier = createWorkersAiClassifier({
      run: async () => ({
        response: JSON.stringify({
          sentiment: 4,
          tags: ["台積電", "AI", "供應鏈", "3奈米"],
          reason: "AI 供應鏈事件"
        })
      })
    });

    await expect(classifier.classify({
      source: "rss",
      title: "台積電 2330 AI 供應鏈訂單升溫",
      engagement: 0
    })).resolves.toEqual({
      sentiment: 4,
      tags: ["AI", "供應鏈"],
      reason: "AI 供應鏈事件"
    });
  });

  it("keeps classifier limits conservative for Worker cron budgets", () => {
    expect(parseClassifierLimit(undefined)).toBe(8);
    expect(parseClassifierLimit("200")).toBe(20);
    expect(parseClassifierLimit("-1")).toBe(0);
  });
});

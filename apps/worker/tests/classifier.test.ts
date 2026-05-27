import { describe, expect, it } from "vitest";
import { createWorkersAiClassifier } from "../src/classifier";

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
});

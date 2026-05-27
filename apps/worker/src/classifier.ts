import { validateLlmClassification, type LlmClassification, type SourceEvent } from "@stock-analytics/shared";

export interface WorkersAiBinding {
  run(model: string, input: unknown): Promise<unknown>;
}

export interface EventClassifier {
  classify(event: Pick<SourceEvent, "source" | "title" | "engagement">): Promise<LlmClassification>;
}

const DEFAULT_CLASSIFIER_MODEL = "@cf/meta/llama-3.1-8b-instruct";

export function createWorkersAiClassifier(ai: WorkersAiBinding, model = DEFAULT_CLASSIFIER_MODEL): EventClassifier {
  return {
    async classify(event) {
      const response = await ai.run(model, {
        messages: [
          {
            role: "system",
            content: [
              "你是台股研究雷達的短文本分類器。",
              "只輸出 JSON，不要 markdown，不要買賣建議，不要進出場價格。",
              "格式: {\"sentiment\":1到5整數,\"tags\":[最多3個繁中短標籤],\"reason\":\"40字內繁中理由\"}"
            ].join("")
          },
          {
            role: "user",
            content: JSON.stringify({
              source: event.source,
              title: event.title.slice(0, 240),
              engagement: event.engagement
            })
          }
        ]
      });

      return validateLlmClassification(parseWorkersAiJson(response));
    }
  };
}

export function parseClassifierLimit(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 20;
  }
  return Math.min(Math.max(Math.trunc(parsed), 0), 50);
}

export function isClassifierEnabled(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase());
}

function parseWorkersAiJson(response: unknown): unknown {
  const text = responseText(response);
  if (!text) {
    return response;
  }
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function responseText(response: unknown): string {
  if (typeof response === "string") {
    return response;
  }
  if (typeof response !== "object" || response === null) {
    return "";
  }
  const record = response as Record<string, unknown>;
  if (typeof record.response === "string") {
    return record.response;
  }
  if (typeof record.result === "object" && record.result !== null) {
    const result = record.result as Record<string, unknown>;
    if (typeof result.response === "string") {
      return result.response;
    }
  }
  return "";
}

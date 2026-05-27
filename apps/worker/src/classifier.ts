import { validateLlmClassification, type LlmClassification, type SourceEvent } from "@stock-analytics/shared";

export interface WorkersAiBinding {
  run(model: string, input: unknown): Promise<unknown>;
}

export interface EventClassifier {
  classify(event: Pick<SourceEvent, "source" | "title" | "engagement">): Promise<LlmClassification>;
}

const DEFAULT_CLASSIFIER_MODEL = "@cf/meta/llama-3.1-8b-instruct";
const SUPPORTED_EVENT_TAGS = new Set([
  "AI",
  "供應鏈",
  "產業題材",
  "營收",
  "財報",
  "公告",
  "籌碼",
  "股利",
  "法說",
  "併購",
  "政策",
  "國際市場",
  "價格量能",
  "討論熱度",
  "先進封裝",
  "注意交易",
  "記憶體",
  "機器人",
  "能源",
  "關稅",
  "報價",
  "需求",
  "漲停",
  "跌停"
]);

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
              `tags 只能從這份清單挑最多3個: ${[...SUPPORTED_EVENT_TAGS].join("、")}。`,
              "格式: {\"sentiment\":1到5整數,\"tags\":[標籤],\"reason\":\"40字內繁中理由\"}"
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

      return normalizeWorkersAiClassification(validateLlmClassification(parseWorkersAiJson(response)));
    }
  };
}

function normalizeWorkersAiClassification(classification: LlmClassification): LlmClassification {
  return {
    ...classification,
    tags: classification.tags.filter((tag) => SUPPORTED_EVENT_TAGS.has(tag)).slice(0, 3)
  };
}

export function parseClassifierLimit(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 8;
  }
  return Math.min(Math.max(Math.trunc(parsed), 0), 20);
}

export function isClassifierEnabled(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase());
}

function parseWorkersAiJson(response: unknown): unknown {
  const text = responseText(response);
  if (!text) {
    return response;
  }
  const jsonText = extractJsonObject(text);
  try {
    return JSON.parse(jsonText);
  } catch {
    return {};
  }
}

function extractJsonObject(value: string): string {
  const withoutFence = value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return withoutFence.slice(start, end + 1);
  }
  return withoutFence;
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

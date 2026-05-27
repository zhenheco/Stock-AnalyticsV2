import type { LlmClassification } from "./types";

export function validateLlmClassification(input: unknown): LlmClassification {
  const record = isRecord(input) ? input : {};
  const rawSentiment = Number(record.sentiment ?? 3);
  const rawTags = Array.isArray(record.tags) ? record.tags : [];
  const rawReason = typeof record.reason === "string" ? record.reason : "";

  return {
    sentiment: clamp(Math.round(rawSentiment), 1, 5),
    tags: rawTags
      .filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0)
      .map((tag) => tag.trim())
      .slice(0, 3),
    reason: rawReason.trim().slice(0, 160)
  };
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return 3;
  }
  return Math.min(max, Math.max(min, value));
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}

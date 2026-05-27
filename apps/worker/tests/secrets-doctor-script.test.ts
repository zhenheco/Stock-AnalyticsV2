import { describe, expect, it } from "vitest";
import { summarizeSecretFields } from "../../../scripts/secrets-doctor.mjs";

describe("secrets-doctor script helpers", () => {
  it("summarizes required secret presence without exposing values", () => {
    expect(summarizeSecretFields({
      fields: [
        { label: "ADMIN_TOKEN", value: "a".repeat(64) },
        { label: "INGEST_WEBHOOK_TOKEN", value: "b".repeat(64) },
        { label: "FINMIND_TOKEN", value: "" }
      ]
    })).toEqual([
      "SECRET ADMIN_TOKEN present length=64",
      "SECRET INGEST_WEBHOOK_TOKEN present length=64",
      "SECRET FINMIND_TOKEN missing length=0",
      "NEXT_ACTION fill op://Dev/stock-analytics-v2/FINMIND_TOKEN then run pnpm sync:finmind-secret && pnpm check:production:ready"
    ]);
  });

  it("flags missing required fields separately from empty values", () => {
    expect(summarizeSecretFields({
      fields: [
        { label: "ADMIN_TOKEN", value: "a".repeat(64) }
      ]
    })).toContain("SECRET FINMIND_TOKEN field-missing length=0");
  });
});

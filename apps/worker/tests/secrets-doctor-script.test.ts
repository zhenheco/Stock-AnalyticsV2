import { describe, expect, it } from "vitest";
import { secretReadinessGate, summarizeSecretFields } from "../../../scripts/secrets-doctor.mjs";

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
      "NEXT_ACTION fill op://Dev/stock-analytics-v2/FINMIND_TOKEN then run pnpm complete:production"
    ]);
  });

  it("flags missing required fields separately from empty values", () => {
    expect(summarizeSecretFields({
      fields: [
        { label: "ADMIN_TOKEN", value: "a".repeat(64) }
      ]
    })).toContain("SECRET FINMIND_TOKEN field-missing length=0");
  });

  it("fails strict secret readiness when any required secret is missing", () => {
    expect(secretReadinessGate({
      fields: [
        { label: "ADMIN_TOKEN", value: "a".repeat(64) },
        { label: "INGEST_WEBHOOK_TOKEN", value: "b".repeat(64) },
        { label: "FINMIND_TOKEN", value: "" }
      ]
    })).toEqual({
      ok: false,
      reasons: ["FINMIND_TOKEN missing"]
    });
  });

  it("passes strict secret readiness when all required secrets are present", () => {
    expect(secretReadinessGate({
      fields: [
        { label: "ADMIN_TOKEN", value: "a".repeat(64) },
        { label: "INGEST_WEBHOOK_TOKEN", value: "b".repeat(64) },
        { label: "FINMIND_TOKEN", value: "finmind-token" }
      ]
    })).toEqual({ ok: true, reasons: [] });
  });
});

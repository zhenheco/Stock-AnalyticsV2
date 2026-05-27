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
      "NEXT_ACTION run pnpm complete:production; optional: fill op://Dev/stock-analytics-v2/FINMIND_TOKEN to improve FinMind quota stability"
    ]);
  });

  it("flags missing required fields separately from empty values", () => {
    expect(summarizeSecretFields({
      fields: [
        { label: "ADMIN_TOKEN", value: "a".repeat(64) }
      ]
    })).toContain("SECRET FINMIND_TOKEN field-missing length=0");
  });

  it("passes strict secret readiness when only optional FinMind token is missing", () => {
    expect(secretReadinessGate({
      fields: [
        { label: "ADMIN_TOKEN", value: "a".repeat(64) },
        { label: "INGEST_WEBHOOK_TOKEN", value: "b".repeat(64) },
        { label: "FINMIND_TOKEN", value: "" }
      ]
    })).toEqual({ ok: true, reasons: [] });
  });

  it("fails strict secret readiness when a required admin secret is missing", () => {
    expect(secretReadinessGate({
      fields: [
        { label: "ADMIN_TOKEN", value: "" },
        { label: "INGEST_WEBHOOK_TOKEN", value: "b".repeat(64) }
      ]
    })).toEqual({
      ok: false,
      reasons: ["ADMIN_TOKEN missing"]
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

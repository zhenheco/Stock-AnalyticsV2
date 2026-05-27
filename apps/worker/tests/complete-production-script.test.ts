import { describe, expect, it } from "vitest";
import { completeProduction } from "../../../scripts/complete-production.mjs";

describe("complete-production script helpers", () => {
  it("runs strict secret check, FinMind sync, and strict production gate in order", async () => {
    const calls: string[] = [];

    await expect(completeProduction({
      run: async (command, args) => {
        calls.push([command, ...args].join(" "));
      }
    })).resolves.toEqual([
      "STEP check:secrets:ready ok",
      "STEP sync:finmind-secret ok",
      "STEP check:production:ready ok",
      "PRODUCTION_COMPLETION_READY"
    ]);

    expect(calls).toEqual([
      "pnpm check:secrets:ready",
      "pnpm sync:finmind-secret",
      "pnpm check:production:ready"
    ]);
  });

  it("stops before FinMind sync when strict secret readiness fails", async () => {
    const calls: string[] = [];

    await expect(completeProduction({
      run: async (command, args) => {
        calls.push([command, ...args].join(" "));
        if (args[0] === "check:secrets:ready") {
          throw new Error("SECRETS_NOT_READY FINMIND_TOKEN missing");
        }
      }
    })).rejects.toThrow("SECRETS_NOT_READY FINMIND_TOKEN missing");

    expect(calls).toEqual([
      "pnpm check:secrets:ready"
    ]);
  });
});

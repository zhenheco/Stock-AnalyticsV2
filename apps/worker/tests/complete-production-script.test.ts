import { describe, expect, it } from "vitest";
import { completeProduction } from "../../../scripts/complete-production.mjs";

describe("complete-production script helpers", () => {
  it("runs secret check, FinMind sync, and strict production gate in order", async () => {
    const calls: string[] = [];

    await expect(completeProduction({
      run: async (command, args) => {
        calls.push([command, ...args].join(" "));
      }
    })).resolves.toEqual([
      "STEP check:secrets ok",
      "STEP sync:finmind-secret ok",
      "STEP check:production:ready ok",
      "PRODUCTION_COMPLETION_READY"
    ]);

    expect(calls).toEqual([
      "pnpm check:secrets",
      "pnpm sync:finmind-secret",
      "pnpm check:production:ready"
    ]);
  });

  it("stops before the ready gate when FinMind sync fails", async () => {
    const calls: string[] = [];

    await expect(completeProduction({
      run: async (command, args) => {
        calls.push([command, ...args].join(" "));
        if (args[0] === "sync:finmind-secret") {
          throw new Error("FINMIND_TOKEN is empty");
        }
      }
    })).rejects.toThrow("FINMIND_TOKEN is empty");

    expect(calls).toEqual([
      "pnpm check:secrets",
      "pnpm sync:finmind-secret"
    ]);
  });
});

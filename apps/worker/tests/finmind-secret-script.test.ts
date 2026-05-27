import { describe, expect, it } from "vitest";
import { formatTokenPresence, summarizeReadiness } from "../../../scripts/sync-finmind-secret.mjs";

describe("sync-finmind-secret script helpers", () => {
  it("reports token presence without exposing the token value", () => {
    const secret = "finmind-secret-token";
    const message = formatTokenPresence(secret);

    expect(message).toBe("FINMIND_TOKEN_PRESENT length=20");
    expect(message).not.toContain(secret);
  });

  it("summarizes readiness checks without requiring raw secret output", () => {
    expect(summarizeReadiness({
      status: "degraded",
      counts: {
        candidates: 100,
        universe: 3059,
        watchlist: 0
      },
      checks: [
        { id: "social-events", status: "ready", message: "PTT 與 RSS 來源最近一次同步正常" },
        { id: "finmind-signals", status: "missing", message: "FINMIND_TOKEN 尚未設定" }
      ]
    })).toBe("READINESS status=degraded candidates=100 universe=3059 finmind-signals=missing message=FINMIND_TOKEN 尚未設定");
  });

  it("summarizes optional token skip without treating it as a hard failure", () => {
    expect(formatTokenPresence("")).toBe("FINMIND_TOKEN_MISSING_OR_EMPTY");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { triggerAdminIngest } from "../src/api";

describe("api", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("triggers admin ingestion with the token only in the request header", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ candidateCount: 12 }), {
      headers: { "content-type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(triggerAdminIngest("secret-token")).resolves.toEqual({ candidateCount: 12 });

    expect(fetchMock).toHaveBeenCalledWith("/api/admin/run-ingest", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-token": "secret-token"
      },
      body: "{}"
    });
  });
});

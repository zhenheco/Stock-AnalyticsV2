import { afterEach, describe, expect, it, vi } from "vitest";
import { removeWatchlistEntry, triggerAdminIngest, triggerAdminScore } from "../src/api";

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

  it("removes a watchlist entry with the token only in the request header", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ removed: true }), {
      headers: { "content-type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(removeWatchlistEntry({ symbol: "2330", adminToken: "secret-token" })).resolves.toEqual({ removed: true });

    expect(fetchMock).toHaveBeenCalledWith("/api/watchlist/2330", {
      method: "DELETE",
      headers: {
        "x-admin-token": "secret-token"
      }
    });
  });

  it("triggers admin scoring with the token only in the request header", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ candidateCount: 9 }), {
      headers: { "content-type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(triggerAdminScore("secret-token")).resolves.toEqual({ candidateCount: 9 });

    expect(fetchMock).toHaveBeenCalledWith("/api/admin/run-score", {
      method: "POST",
      headers: {
        "x-admin-token": "secret-token"
      }
    });
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { readStoredAdminToken, storeAdminToken } from "../src/adminToken";

describe("admin token storage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads and writes a trimmed admin token from browser storage", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value)
      }
    });

    storeAdminToken("  secret-token  ");

    expect(storage.get("stock-analytics-admin-token")).toBe("secret-token");
    expect(readStoredAdminToken()).toBe("secret-token");
  });

  it("does nothing outside the browser", () => {
    vi.stubGlobal("window", undefined);

    expect(readStoredAdminToken()).toBe("");
    expect(() => storeAdminToken("secret-token")).not.toThrow();
  });
});

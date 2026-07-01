import { describe, expect, it } from "vitest";
import { buildSentryOptions, scrubSentryEvent } from "./sentry";

describe("web Sentry config", () => {
  it("stays disabled without a DSN and otherwise reads Vite env options", () => {
    expect(buildSentryOptions({})).toBeUndefined();

    const options = buildSentryOptions({
      VITE_SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
      VITE_SENTRY_ENVIRONMENT: "production",
      VITE_SENTRY_RELEASE: "abc123",
      VITE_SENTRY_TRACES_SAMPLE_RATE: "0.15"
    });

    expect(options).toMatchObject({
      dsn: "https://public@example.ingest.sentry.io/1",
      environment: "production",
      release: "abc123",
      tracesSampleRate: 0.15,
      sendDefaultPii: false
    });
    expect(options?.integrations).toHaveLength(1);
    expect(options?.tracePropagationTargets).toEqual([/^\/api\//, /^https:\/\/stock-analytics-v2-worker\.acejou27\.workers\.dev\/api/]);
    expect(options?.beforeSend).toBe(scrubSentryEvent);
  });

  it("scrubs browser request URLs, user identifiers, and admin token breadcrumbs", () => {
    const event = scrubSentryEvent({
      user: {
        id: "admin",
        email: "person@example.com",
        ip_address: "203.0.113.10"
      },
      request: {
        url: "https://stock-analytics-v2.pages.dev/watchlist?token=secret",
        query_string: "token=secret",
        headers: {
          cookie: "session=secret",
          "x-admin-token": "secret",
          "user-agent": "vitest"
        },
        data: {
          adminToken: "secret",
          symbol: "2330"
        }
      },
      breadcrumbs: [
        {
          message: "POST https://stock-analytics-v2.pages.dev/api/watchlist?token=secret",
          data: {
            url: "https://stock-analytics-v2.pages.dev/api/watchlist?x-admin-token=secret",
            ordinary: "kept"
          }
        }
      ],
      extra: {
        adminToken: "secret",
        symbol: "2330"
      }
    });

    expect(event.user).toEqual({});
    expect(event.request).toEqual({
      url: "https://stock-analytics-v2.pages.dev/watchlist",
      headers: { "user-agent": "vitest" }
    });
    expect(event.breadcrumbs).toEqual([
      {
        message: "POST https://stock-analytics-v2.pages.dev/api/watchlist",
        data: {
          url: "https://stock-analytics-v2.pages.dev/api/watchlist",
          ordinary: "kept"
        }
      }
    ]);
    expect(event.extra).toEqual({ symbol: "2330" });
  });
});

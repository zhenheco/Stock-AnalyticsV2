import { describe, expect, it } from "vitest";
import { buildSentryOptions, scrubSentryEvent, scrubSentrySpan } from "./sentry";

describe("worker Sentry config", () => {
  it("stays disabled without a DSN and otherwise reads Worker env options", () => {
    expect(buildSentryOptions({})).toBeUndefined();

    const options = buildSentryOptions({
      SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
      SENTRY_ENVIRONMENT: "production",
      SENTRY_RELEASE: "abc123",
      SENTRY_TRACES_SAMPLE_RATE: "0.25"
    });

    expect(options).toMatchObject({
      dsn: "https://public@example.ingest.sentry.io/1",
      environment: "production",
      release: "abc123",
      tracesSampleRate: 0.25,
      sendDefaultPii: false
    });
    expect(options?.beforeSend).toBe(scrubSentryEvent);
    expect(options?.beforeSendTransaction).toBe(scrubSentryEvent);
    expect(options?.beforeSendSpan).toBe(scrubSentrySpan);
  });

  it("scrubs request secrets, admin tokens, bodies, and URL query strings", () => {
    const event = scrubSentryEvent({
      user: {
        id: "admin",
        email: "person@example.com",
        ip_address: "203.0.113.10"
      },
      request: {
        url: "https://api.example.test/api/admin/run-ingest?token=secret",
        query_string: "token=secret",
        headers: {
          authorization: "Bearer secret",
          cookie: "session=secret",
          "x-admin-token": "secret",
          "user-agent": "vitest"
        },
        data: {
          adminToken: "secret",
          symbol: "2330"
        }
      },
      extra: {
        token: "secret",
        watchlist: {
          symbol: "2330",
          note: "kept"
        }
      },
      spans: [
        {
          description: "POST https://api.example.test/api/admin/run-ingest?token=secret",
          data: {
            url: "https://api.example.test/api/admin/run-ingest?token=secret",
            ordinary: "kept"
          }
        }
      ]
    });

    expect(event.user).toEqual({});
    expect(event.request).toEqual({
      url: "https://api.example.test/api/admin/run-ingest",
      headers: { "user-agent": "vitest" }
    });
    expect(event.extra).toEqual({
      watchlist: {
        symbol: "2330",
        note: "kept"
      }
    });
    expect(event.spans).toEqual([
      {
        description: "POST https://api.example.test/api/admin/run-ingest",
        data: {
          url: "https://api.example.test/api/admin/run-ingest",
          ordinary: "kept"
        }
      }
    ]);
  });

  it("scrubs sensitive URL fields from individual spans", () => {
    expect(
      scrubSentrySpan({
        description: "GET https://api.example.test/api/watchlist?token=secret",
        data: {
          "http.request.header.authorization": "Bearer secret",
          "http.request.header.x-admin-token": "secret",
          "http.response.header.set-cookie": "session=secret",
          url: "https://api.example.test/api/watchlist?x-admin-token=secret",
          authorization: "Bearer secret"
        }
      })
    ).toEqual({
      description: "GET https://api.example.test/api/watchlist",
      data: {
        url: "https://api.example.test/api/watchlist"
      }
    });
  });
});

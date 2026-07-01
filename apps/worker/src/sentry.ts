import * as Sentry from "@sentry/cloudflare";
import type { WorkerEnv } from "./app";

export type StockWorker = ExportedHandler<WorkerEnv> & {
  fetch: WorkerFetchHandler;
  scheduled: WorkerScheduledHandler;
};

type WorkerFetchHandler = NonNullable<ExportedHandler<WorkerEnv>["fetch"]>;
type WorkerScheduledHandler = NonNullable<ExportedHandler<WorkerEnv>["scheduled"]>;

const SENSITIVE_KEYS = new Set([
  "admin-token",
  "admintoken",
  "authorization",
  "body",
  "cf-connecting-ip",
  "cfconnectingip",
  "client-ip",
  "clientip",
  "cookie",
  "email",
  "finmind-token",
  "finmindtoken",
  "ingest-webhook-token",
  "ingestwebhooktoken",
  "ip",
  "ip_address",
  "ipaddress",
  "password",
  "secret",
  "set-cookie",
  "setcookie",
  "token",
  "true-client-ip",
  "trueclientip",
  "x-admin-token",
  "x-real-ip",
  "xadmintoken",
  "x-forwarded-for",
  "xforwardedfor",
  "xrealip"
]);

const USER_KEYS = new Set(["email", "id", "ip", "ip_address", "ipaddress"]);
const URL_KEYS = new Set(["http.url", "httpurl", "request.url", "requesturl", "url"]);

function normalizeKey(key: string) {
  return key.toLowerCase().replace(/[_-\s]/g, "");
}

function isSensitiveKey(key: string, parentKey = "") {
  if (normalizeKey(parentKey) === "user" && USER_KEYS.has(normalizeKey(key))) return true;
  const rawParts = key.toLowerCase().split(".");
  return rawParts.some((part) => SENSITIVE_KEYS.has(part) || SENSITIVE_KEYS.has(normalizeKey(part))) || SENSITIVE_KEYS.has(normalizeKey(key));
}

function isUrlKey(key: string) {
  return URL_KEYS.has(key.toLowerCase()) || URL_KEYS.has(normalizeKey(key));
}

function stripUrlQuery(url: string) {
  try {
    const parsed = new URL(url);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url.split("?")[0]?.split("#")[0] || url;
  }
}

function stripUrlQueriesInText(value: string) {
  return value.replace(/https?:\/\/[^\s"'<>]+/g, (match) => {
    const trailing = match.match(/[),.;:!?]+$/)?.[0] ?? "";
    const core = trailing ? match.slice(0, -trailing.length) : match;
    return `${stripUrlQuery(core)}${trailing}`;
  });
}

function scrubValue(value: unknown, key = ""): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => scrubValue(entry, key));
  }

  if (!value || typeof value !== "object") {
    if (typeof value === "string") {
      if (isUrlKey(key)) return stripUrlQuery(value);
      if (key.toLowerCase() === "description" || key.toLowerCase() === "message") {
        return stripUrlQueriesInText(value);
      }
    }
    return value;
  }

  const clean: Record<string, unknown> = {};
  for (const [entryKey, entry] of Object.entries(value)) {
    if (isSensitiveKey(entryKey, key)) continue;

    const scrubbed = scrubValue(entry, entryKey);
    if (scrubbed !== undefined) {
      clean[entryKey] = scrubbed;
    }
  }
  return clean;
}

export function scrubSentryEvent<T extends Record<string, unknown>>(event: T): T {
  const clean = scrubValue(event) as T & {
    request?: {
      url?: unknown;
      query_string?: unknown;
      data?: unknown;
    };
  };

  if (clean.request) {
    clean.request.url = typeof clean.request.url === "string" ? stripUrlQuery(clean.request.url) : clean.request.url;
    delete clean.request.query_string;
    delete clean.request.data;
  }

  return clean as T;
}

export function scrubSentrySpan<T extends Record<string, unknown>>(span: T): T {
  return scrubValue(span) as T;
}

export function buildSentryOptions(env: Partial<WorkerEnv> = {}): Sentry.CloudflareOptions | undefined {
  if (!env.SENTRY_DSN) return undefined;

  return {
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT ?? "production",
    release: env.SENTRY_RELEASE,
    tracesSampleRate: Number(env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
    sendDefaultPii: false,
    beforeSend: scrubSentryEvent as Sentry.CloudflareOptions["beforeSend"],
    beforeSendTransaction: scrubSentryEvent as Sentry.CloudflareOptions["beforeSendTransaction"],
    beforeSendSpan: scrubSentrySpan as Sentry.CloudflareOptions["beforeSendSpan"]
  };
}

export function withSentry<T extends StockWorker>(worker: T): T {
  let sentryWorker: T | undefined;

  function getSentryWorker() {
    sentryWorker ??= Sentry.withSentry<WorkerEnv, unknown, unknown, T>(buildSentryOptions, worker);
    return sentryWorker;
  }

  return {
    ...worker,
    fetch(
      request: Parameters<WorkerFetchHandler>[0],
      env: Parameters<WorkerFetchHandler>[1],
      ctx: Parameters<WorkerFetchHandler>[2]
    ) {
      if (!env.SENTRY_DSN || typeof ctx?.waitUntil !== "function") {
        return worker.fetch(request, env, ctx);
      }
      return getSentryWorker().fetch(request, env, ctx);
    },
    scheduled(
      controller: Parameters<WorkerScheduledHandler>[0],
      env: Parameters<WorkerScheduledHandler>[1],
      ctx: Parameters<WorkerScheduledHandler>[2]
    ) {
      if (!env.SENTRY_DSN || typeof ctx?.waitUntil !== "function") {
        return worker.scheduled(controller, env, ctx);
      }
      return getSentryWorker().scheduled(controller, env, ctx);
    }
  } as T;
}

import * as Sentry from "@sentry/react";

type SentryEnv = Partial<{
  VITE_SENTRY_DSN: string;
  VITE_SENTRY_ENVIRONMENT: string;
  VITE_SENTRY_RELEASE: string;
  VITE_SENTRY_TRACES_SAMPLE_RATE: string;
}>;

const SENSITIVE_KEYS = new Set([
  "admin-token",
  "admintoken",
  "authorization",
  "body",
  "cookie",
  "email",
  "ip",
  "ip_address",
  "ipaddress",
  "password",
  "secret",
  "set-cookie",
  "setcookie",
  "token",
  "x-admin-token",
  "xadmintoken"
]);

const USER_KEYS = new Set(["email", "id", "ip", "ip_address", "ipaddress"]);
const URL_KEYS = new Set(["http.url", "httpurl", "request.url", "requesturl", "url"]);

function normalizeKey(key: string) {
  return key.toLowerCase().replace(/[_-\s]/g, "");
}

function isSensitiveKey(key: string, parentKey = "") {
  if (normalizeKey(parentKey) === "user" && USER_KEYS.has(normalizeKey(key))) return true;
  return SENSITIVE_KEYS.has(key.toLowerCase()) || SENSITIVE_KEYS.has(normalizeKey(key));
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

export function buildSentryOptions(env: SentryEnv): Sentry.BrowserOptions | undefined {
  if (!env.VITE_SENTRY_DSN) return undefined;

  return {
    dsn: env.VITE_SENTRY_DSN,
    environment: env.VITE_SENTRY_ENVIRONMENT ?? "production",
    release: env.VITE_SENTRY_RELEASE,
    tracesSampleRate: Number(env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
    integrations: [Sentry.browserTracingIntegration()],
    tracePropagationTargets: [/^\/api\//, /^https:\/\/stock-analytics-v2-worker\.acejou27\.workers\.dev\/api/],
    sendDefaultPii: false,
    beforeSend: scrubSentryEvent as Sentry.BrowserOptions["beforeSend"]
  };
}

export function initSentry(env: SentryEnv = import.meta.env) {
  const options = buildSentryOptions(env);
  if (options) {
    Sentry.init(options);
  }
}

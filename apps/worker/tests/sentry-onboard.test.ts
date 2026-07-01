import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { describe, expect, it } from "vitest";
import worker, { rawWorker } from "../src/index";

function readWorkerFile(path: string) {
  return readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");
}

describe("worker Sentry onboarding contract", () => {
  it("keeps the raw Worker testable while exporting a Sentry-wrapped default", () => {
    expect(rawWorker.fetch).toEqual(expect.any(Function));
    expect(rawWorker.scheduled).toEqual(expect.any(Function));
    expect(worker.fetch).toEqual(expect.any(Function));
    expect(worker.scheduled).toEqual(expect.any(Function));
    expect(worker).not.toBe(rawWorker);
  });

  it("installs Cloudflare Sentry SDK and source-map deploy scripts", () => {
    const packageJson = JSON.parse(readWorkerFile("package.json"));

    expect(packageJson.dependencies["@sentry/cloudflare"]).toBeTruthy();
    expect(packageJson.devDependencies["@sentry/cli"]).toBeTruthy();
    expect(packageJson.scripts["sentry:sourcemaps"]).toContain("sentry-cli sourcemaps inject");
    expect(packageJson.scripts["sentry:sourcemaps"]).toContain("sentry-cli sourcemaps upload");
    expect(packageJson.scripts["sentry:sourcemaps"]).toContain("/tmp/stock-analyticsv2-worker-wrangler-dryrun");
    expect(packageJson.scripts["deploy:sentry"]).toContain("export SENTRY_RELEASE=${SENTRY_RELEASE:-$(git rev-parse HEAD)}");
    expect(packageJson.scripts["deploy:sentry"]).toContain("pnpm sentry:sourcemaps");
    expect(packageJson.scripts["deploy:sentry"]).toContain("--var SENTRY_RELEASE:$SENTRY_RELEASE");
    expect(packageJson.scripts["deploy:sentry"]).toContain("/tmp/stock-analyticsv2-worker-wrangler-dryrun/index.js");
  });

  it("keeps only non-sensitive Sentry defaults in wrangler config", () => {
    const wrangler = readWorkerFile("wrangler.toml");

    expect(wrangler).toMatch(/^compatibility_flags = \["nodejs_als"\]$/m);
    expect(wrangler).toMatch(/^upload_source_maps = true$/m);
    expect(wrangler).toContain('SENTRY_ENVIRONMENT = "production"');
    expect(wrangler).toContain('SENTRY_TRACES_SAMPLE_RATE = "0.1"');
    expect(wrangler).not.toMatch(/^SENTRY_DSN\s*=/m);
    expect(wrangler).not.toMatch(/^SENTRY_AUTH_TOKEN\s*=/m);
    expect(wrangler).toContain("wrangler secret put SENTRY_DSN");
    expect(wrangler).toContain("SENTRY_RELEASE is supplied by pnpm deploy:sentry");
  });
});

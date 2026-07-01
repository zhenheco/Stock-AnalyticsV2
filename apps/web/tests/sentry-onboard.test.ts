import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { describe, expect, it } from "vitest";

function readWebFile(path: string) {
  return readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");
}

describe("web Sentry onboarding contract", () => {
  it("initializes Sentry before mounting React", () => {
    const main = readWebFile("src/main.tsx");

    expect(main).toContain('import { initSentry } from "./sentry"');
    expect(main.indexOf("initSentry();")).toBeLessThan(main.indexOf("createRoot(root).render"));
  });

  it("installs React Sentry SDK and Vite source-map upload support", () => {
    const packageJson = JSON.parse(readWebFile("package.json"));
    const viteConfig = readWebFile("vite.config.ts");

    expect(packageJson.dependencies["@sentry/react"]).toBeTruthy();
    expect(packageJson.devDependencies["@sentry/vite-plugin"]).toBeTruthy();
    expect(packageJson.scripts["deploy:sentry"]).toContain("export VITE_SENTRY_RELEASE=${VITE_SENTRY_RELEASE:-$(git rev-parse HEAD)}");
    expect(packageJson.scripts["deploy:sentry"]).toContain('test -n "$SENTRY_AUTH_TOKEN"');
    expect(packageJson.scripts["deploy:sentry"]).toContain('test -n "$VITE_SENTRY_DSN"');
    expect(packageJson.scripts["deploy:sentry"]).toContain("SENTRY_PROJECT=${SENTRY_PROJECT:-stock-analyticsv2-web}");
    expect(viteConfig).toContain("sentryVitePlugin");
    expect(viteConfig).toContain('sourcemap: sentryAuthToken ? "hidden" : false');
    expect(viteConfig).toContain('filesToDeleteAfterUpload: ["dist/**/*.map"]');
    expect(viteConfig).toContain("stock-analyticsv2-web");
    expect(viteConfig).not.toContain("SENTRY_AUTH_TOKEN=");
  });
});

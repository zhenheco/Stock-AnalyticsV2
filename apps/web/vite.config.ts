import { sentryVitePlugin } from "@sentry/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;
const sentryOrg = process.env.SENTRY_ORG ?? "zhenheai";
const sentryProject = process.env.SENTRY_PROJECT ?? "stock-analyticsv2-web";
const sentryRelease = process.env.VITE_SENTRY_RELEASE ?? process.env.SENTRY_RELEASE;

export default defineConfig({
  build: {
    sourcemap: sentryAuthToken ? "hidden" : false
  },
  plugins: [
    react(),
    sentryAuthToken
      ? sentryVitePlugin({
          org: sentryOrg,
          project: sentryProject,
          authToken: sentryAuthToken,
          release: sentryRelease ? { name: sentryRelease } : undefined,
          sourcemaps: {
            filesToDeleteAfterUpload: ["dist/**/*.map"]
          },
          telemetry: false
        })
      : undefined
  ].filter(Boolean)
});

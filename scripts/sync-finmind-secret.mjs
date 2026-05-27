#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const DEFAULT_FINMIND_REF = "op://Dev/stock-analytics-v2/FINMIND_TOKEN";
const DEFAULT_ADMIN_REF = "op://Dev/stock-analytics-v2/ADMIN_TOKEN";
const WORKER_URL = "https://stock-analytics-v2-worker.acejou27.workers.dev";

export function formatTokenPresence(token) {
  return token ? `FINMIND_TOKEN_PRESENT length=${token.length}` : "FINMIND_TOKEN_MISSING_OR_EMPTY";
}

export function summarizeReadiness(readiness) {
  const finmind = readiness.checks.find((check) => check.id === "finmind-signals");
  return [
    `READINESS status=${readiness.status}`,
    `candidates=${readiness.counts.candidates}`,
    `universe=${readiness.counts.universe}`,
    `finmind-signals=${finmind?.status ?? "unknown"}`,
    `message=${finmind?.message ?? ""}`
  ].join(" ");
}

async function main(argv) {
  const checkOnly = argv.includes("--check-only");
  const optional = argv.includes("--optional");
  const skipIngest = argv.includes("--skip-ingest");
  const finmindRef = process.env.FINMIND_TOKEN_REF ?? DEFAULT_FINMIND_REF;
  const adminRef = process.env.ADMIN_TOKEN_REF ?? DEFAULT_ADMIN_REF;

  const finmindToken = await readOp(finmindRef);
  console.log(formatTokenPresence(finmindToken));

  if (checkOnly) {
    console.log(summarizeReadiness(await fetchReadiness()));
    return;
  }

  if (!finmindToken) {
    if (optional) {
      console.log("FINMIND_TOKEN_SYNC_SKIPPED optional=true");
      console.log(summarizeReadiness(await fetchReadiness()));
      return;
    }
    throw new Error(`FINMIND_TOKEN is empty at ${finmindRef}. Fill the 1Password item before syncing Cloudflare secrets.`);
  }

  await putCloudflareSecret(finmindToken);
  console.log("FINMIND_TOKEN_SYNCED_TO_CLOUDFLARE");

  if (!skipIngest) {
    const adminToken = await readOp(adminRef);
    if (!adminToken) {
      throw new Error(`ADMIN_TOKEN is empty at ${adminRef}. Cannot run production ingestion smoke.`);
    }
    const ingestResult = await triggerIngest(adminToken);
    console.log(`INGEST_TRIGGERED candidateCount=${ingestResult.candidateCount}`);
  }

  console.log(summarizeReadiness(await fetchReadiness()));
}

async function readOp(ref) {
  const result = await run("op", ["read", ref], { capture: true });
  return result.stdout.trim();
}

async function putCloudflareSecret(token) {
  await run("pnpm", ["exec", "wrangler", "secret", "put", "FINMIND_TOKEN"], {
    cwd: "apps/worker",
    input: `${token}\n`
  });
}

async function triggerIngest(adminToken) {
  const response = await fetch(`${WORKER_URL}/api/admin/run-ingest`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-admin-token": adminToken
    },
    body: "{}"
  });
  if (!response.ok) {
    throw new Error(`Production ingestion failed with HTTP ${response.status}`);
  }
  return await response.json();
}

async function fetchReadiness() {
  const response = await fetch(`${WORKER_URL}/api/data-readiness`);
  if (!response.ok) {
    throw new Error(`Readiness fetch failed with HTTP ${response.status}`);
  }
  return await response.json();
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : ["pipe", "inherit", "inherit"]
    });
    let stdout = "";
    let stderr = "";

    if (options.capture) {
      child.stdout?.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr?.on("data", (chunk) => {
        stderr += chunk.toString();
      });
    }

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${command} ${args.join(" ")} failed with exit ${code}${stderr ? `: ${stderr.trim()}` : ""}`));
      }
    });

    if (options.input) {
      child.stdin?.end(options.input);
    }
  });
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

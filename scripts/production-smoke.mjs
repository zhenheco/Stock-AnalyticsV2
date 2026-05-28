#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const DEFAULT_ADMIN_REF = "op://Dev/stock-analytics-v2/ADMIN_TOKEN";
const WORKER_URL = "https://stock-analytics-v2-worker.acejou27.workers.dev";
const REQUIRED_TOKENLESS_SOURCES = ["ptt", "rss", "twse", "mops"];

export function summarizeProductionSmoke(input) {
  const topCandidate = input.candidates.candidates[0];
  return [
    `INGEST candidateCount=${input.ingest.candidateCount ?? 0}`,
    `READINESS status=${input.readiness.status} candidates=${input.readiness.counts.candidates} universe=${input.readiness.counts.universe}`,
    `SOURCE_RUNS ${formatSourceRuns(input.sourceRuns.runs)}`,
    topCandidate
      ? `TOP_CANDIDATE symbol=${topCandidate.symbol} name=${topCandidate.name} sourceEventCounts=${formatSourceEventCounts(topCandidate.sourceEventCounts)}`
      : "TOP_CANDIDATE missing"
  ];
}

export function productionSmokeGate(input) {
  const reasons = [];
  const topCandidate = input.candidates.candidates[0];

  if ((input.ingest.candidateCount ?? 0) <= 0) {
    reasons.push("ingest candidateCount empty");
  }
  if (input.readiness.counts.candidates <= 0) {
    reasons.push("readiness candidates empty");
  }
  if (!topCandidate) {
    reasons.push("top candidate missing");
  } else if (!topCandidate.sourceEventCounts || Object.keys(topCandidate.sourceEventCounts).length === 0) {
    reasons.push("top candidate source counts missing");
  }

  for (const source of REQUIRED_TOKENLESS_SOURCES) {
    const latest = latestRunForSource(input.sourceRuns.runs, source);
    if (latest?.status !== "ok") {
      reasons.push(`${source} source run not ok`);
    }
  }

  return { ok: reasons.length === 0, reasons };
}

async function main() {
  const adminRef = process.env.ADMIN_TOKEN_REF ?? DEFAULT_ADMIN_REF;
  const adminToken = await readOp(adminRef);
  if (!adminToken) {
    throw new Error(`ADMIN_TOKEN is empty at ${adminRef}. Cannot run production ingestion smoke.`);
  }

  const ingest = await triggerIngest(adminToken);
  const [readiness, sourceRuns, candidates] = await Promise.all([
    fetchJson(`${WORKER_URL}/api/data-readiness`),
    fetchJson(`${WORKER_URL}/api/source-runs`),
    fetchJson(`${WORKER_URL}/api/candidates?limit=1&t=${Date.now()}`)
  ]);

  const smoke = { ingest, readiness, sourceRuns, candidates };
  for (const line of summarizeProductionSmoke(smoke)) {
    console.log(line);
  }

  const gate = productionSmokeGate(smoke);
  if (!gate.ok) {
    throw new Error(`PRODUCTION_SMOKE_FAILED ${gate.reasons.join("; ")}`);
  }
  console.log("PRODUCTION_SMOKE_OK");
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

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} failed with HTTP ${response.status}`);
  }
  return await response.json();
}

async function readOp(ref) {
  const result = await run("op", ["read", ref], { capture: true });
  return result.stdout.trim();
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
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
  });
}

function formatSourceRuns(runs) {
  return ["ptt", "rss", "twse", "mops", "finmind"]
    .map((source) => {
      const run = latestRunForSource(runs, source);
      return `${source}=${run?.status ?? "missing"}:${run?.itemCount ?? 0}`;
    })
    .join(" ");
}

function latestRunForSource(runs, source) {
  return runs
    .filter((run) => run.source === source)
    .sort((left, right) => String(right.startedAt ?? "").localeCompare(String(left.startedAt ?? "")))[0];
}

function formatSourceEventCounts(counts) {
  if (!counts || Object.keys(counts).length === 0) {
    return "missing";
  }
  return ["finmind", "rss", "ptt", "twse", "mops"]
    .filter((source) => Number.isFinite(counts[source]))
    .map((source) => `${source}:${counts[source]}`)
    .join(",");
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

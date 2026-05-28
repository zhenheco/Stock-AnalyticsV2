#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { formatTokenPresence } from "./sync-finmind-secret.mjs";

const DEFAULT_FINMIND_REF = "op://Dev/stock-analytics-v2/FINMIND_TOKEN";
const PAGES_URL = "https://stock-analytics-v2.pages.dev";
const WORKER_URL = "https://stock-analytics-v2-worker.acejou27.workers.dev";

export function summarizeProductionHealth({ page, readiness, candidates, finmindToken }) {
  return [
    formatPagesLine(page),
    formatReadinessLine(readiness),
    formatChecksLine(readiness),
    formatTopCandidateLine(candidates),
    formatTokenPresence(finmindToken)
  ];
}

export function productionHealthGate(input) {
  const reasons = [];
  const topCandidate = input.candidates.candidates[0];

  if (input.page.status !== 200) {
    reasons.push(`pages=${input.page.status}`);
  }
  if (!extractAsset(input.page.html, "js")) {
    reasons.push("pages bundle missing");
  }
  if (!extractAsset(input.page.html, "css")) {
    reasons.push("pages css missing");
  }
  if (input.readiness.status !== "ready") {
    reasons.push(`readiness=${input.readiness.status}`);
  }
  for (const check of input.readiness.checks) {
    if (check.status !== "ready") {
      reasons.push(`${check.id}=${check.status}`);
    }
  }
  if (!topCandidate) {
    reasons.push("top candidate missing");
  } else if (!topCandidate.sourceEventCounts || Object.keys(topCandidate.sourceEventCounts).length === 0) {
    reasons.push("top candidate source counts missing");
  }
  return { ok: reasons.length === 0, reasons };
}

function formatPagesLine(page) {
  return [
    `PAGES status=${page.status}`,
    `bundle=${extractAsset(page.html, "js") ?? "missing"}`,
    `css=${extractAsset(page.html, "css") ?? "missing"}`
  ].join(" ");
}

function formatReadinessLine(readiness) {
  return [
    `READINESS status=${readiness.status}`,
    `completion=${completionPercent(readiness)}%`,
    `candidates=${readiness.counts.candidates}`,
    `universe=${readiness.counts.universe}`,
    `watchlist=${readiness.counts.watchlist}`
  ].join(" ");
}

function formatChecksLine(readiness) {
  return `CHECKS ${readiness.checks.map((check) => `${check.id}=${check.status}`).join(" ")}`;
}

function formatTopCandidateLine(candidates) {
  const candidate = candidates.candidates[0];
  if (!candidate) {
    return "TOP_CANDIDATE missing";
  }
  return [
    `TOP_CANDIDATE symbol=${candidate.symbol}`,
    `name=${candidate.name}`,
    `updatedAt=${candidates.updatedAt ?? "unknown"}`,
    `sourceEventCounts=${formatSourceEventCounts(candidate.sourceEventCounts)}`
  ].join(" ");
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

function extractAsset(html, extension) {
  const match = html.match(new RegExp(`assets/index-[^"']+\\.${extension}`));
  return match?.[0] ?? null;
}

function completionPercent(readiness) {
  if (readiness.checks.length === 0) {
    return 0;
  }
  const ready = readiness.checks.filter((check) => check.status === "ready").length;
  return Math.round((ready / readiness.checks.length) * 100);
}

async function main(argv) {
  const skipSecret = argv.includes("--skip-secret");
  const requireReady = argv.includes("--require-ready");
  const finmindRef = process.env.FINMIND_TOKEN_REF ?? DEFAULT_FINMIND_REF;

  const [page, readiness, candidates, finmindToken] = await Promise.all([
    fetchPage(),
    fetchJson(`${WORKER_URL}/api/data-readiness`),
    fetchJson(`${WORKER_URL}/api/candidates?limit=1&t=${Date.now()}`),
    skipSecret ? "" : readOp(finmindRef)
  ]);

  const health = { page, readiness, candidates, finmindToken };
  for (const line of summarizeProductionHealth(health)) {
    console.log(line);
  }
  if (requireReady) {
    const gate = productionHealthGate(health);
    if (!gate.ok) {
      throw new Error(`PRODUCTION_NOT_READY ${gate.reasons.join("; ")}`);
    }
    console.log("PRODUCTION_READY");
  }
}

async function fetchPage() {
  const response = await fetch(PAGES_URL);
  return {
    status: response.status,
    html: await response.text()
  };
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} failed with HTTP ${response.status}`);
  }
  return await response.json();
}

async function readOp(ref) {
  try {
    const result = await run("op", ["read", ref], { capture: true });
    return result.stdout.trim();
  } catch {
    return "";
  }
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

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

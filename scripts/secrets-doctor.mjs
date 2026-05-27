#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const DEFAULT_ITEM = "stock-analytics-v2";
const DEFAULT_VAULT = "Dev";
const REQUIRED_FIELDS = ["ADMIN_TOKEN", "INGEST_WEBHOOK_TOKEN", "FINMIND_TOKEN"];

export function summarizeSecretFields(item) {
  const fields = item.fields ?? [];
  const lines = REQUIRED_FIELDS.map((label) => {
    const field = fields.find((candidate) => candidate.label === label);
    if (!field) {
      return `SECRET ${label} field-missing length=0`;
    }
    const value = String(field.value ?? "").trim();
    return `SECRET ${label} ${value ? "present" : "missing"} length=${value.length}`;
  });

  if (lines.some((line) => line.includes("FINMIND_TOKEN missing") || line.includes("FINMIND_TOKEN field-missing"))) {
    lines.push("NEXT_ACTION fill op://Dev/stock-analytics-v2/FINMIND_TOKEN then run pnpm sync:finmind-secret && pnpm check:production:ready");
  } else {
    lines.push("NEXT_ACTION run pnpm sync:finmind-secret && pnpm check:production:ready");
  }

  return lines;
}

export function secretReadinessGate(item) {
  const fields = item.fields ?? [];
  const reasons = REQUIRED_FIELDS.flatMap((label) => {
    const field = fields.find((candidate) => candidate.label === label);
    const value = String(field?.value ?? "").trim();
    return value ? [] : [`${label} missing`];
  });

  return {
    ok: reasons.length === 0,
    reasons
  };
}

async function main() {
  const requireReady = process.argv.includes("--require-ready");
  const itemName = process.env.STOCK_ANALYTICS_OP_ITEM ?? DEFAULT_ITEM;
  const vault = process.env.STOCK_ANALYTICS_OP_VAULT ?? DEFAULT_VAULT;
  const item = await readItem(itemName, vault);

  for (const line of summarizeSecretFields(item)) {
    console.log(line);
  }

  if (requireReady) {
    const gate = secretReadinessGate(item);
    if (!gate.ok) {
      throw new Error(`SECRETS_NOT_READY ${gate.reasons.join("; ")}`);
    }
    console.log("SECRETS_READY");
  }
}

async function readItem(itemName, vault) {
  const result = await run("op", ["item", "get", itemName, "--vault", vault, "--format", "json"], { capture: true });
  return JSON.parse(result.stdout);
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
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

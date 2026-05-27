#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const STEPS = [
  { name: "check:secrets:ready", args: ["check:secrets:ready"] },
  { name: "check:production:smoke", args: ["check:production:smoke"] },
  { name: "sync:finmind-secret", args: ["sync:finmind-secret"] },
  { name: "check:production:ready", args: ["check:production:ready"] }
];

export async function completeProduction(options = {}) {
  const run = options.run ?? runCommand;
  const lines = [];

  for (const step of STEPS) {
    await run("pnpm", step.args);
    lines.push(`STEP ${step.name} ok`);
  }

  lines.push("PRODUCTION_COMPLETION_READY");
  return lines;
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit"
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} failed with exit ${code}`));
      }
    });
  });
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  completeProduction()
    .then((lines) => {
      for (const line of lines) {
        console.log(line);
      }
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const EXPECTED_PROJECT = "sharkedge";
const EXPECTED_SCOPE = "steveo1287s-projects";
const CANONICAL_DOMAIN = "sharkedge.vercel.app";
const PROBE_TIMEOUT_MS = 20_000;

function fail(message) {
  console.error(`\n[deploy:prod] ${message}`);
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: "pipe",
    shell: process.platform === "win32"
  });

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.status !== 0) {
    fail(`Command failed: ${command} ${args.join(" ")}\n${output}`);
  }

  return output;
}

function loadProjectLink() {
  const projectPath = resolve(".vercel", "project.json");
  if (!existsSync(projectPath)) {
    fail("Missing .vercel/project.json. Run: npx vercel link --scope steveo1287s-projects --project sharkedge");
  }

  const data = JSON.parse(readFileSync(projectPath, "utf8"));
  if (data.projectName !== EXPECTED_PROJECT) {
    fail(`Linked project is '${data.projectName}', expected '${EXPECTED_PROJECT}'.`);
  }

  return data;
}

function extractProductionUrl(output) {
  const match = output.match(/Production:\s+(https:\/\/[a-z0-9-]+\.vercel\.app)/i);
  return match?.[1] ?? null;
}

function extractLastReadyDeployment(output) {
  const lines = output.split(/\r?\n/);
  for (const line of lines) {
    if (!line.includes("● Ready")) {
      continue;
    }
    const match = line.match(/https:\/\/[a-z0-9-]+\.vercel\.app/i);
    if (match) {
      return match[0];
    }
  }
  return null;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function runProbes(domain) {
  const board = await fetchJson(`https://${domain}/api/v1/board?status=all&date=all&v=postdeploy`);
  if (!board || typeof board !== "object") {
    throw new Error("Board probe returned invalid payload.");
  }
  if (typeof board.source !== "string") {
    throw new Error("Board probe missing source.");
  }

  const readiness = await fetchJson(`https://${domain}/api/v1/providers/readiness?v=postdeploy`);
  if (!readiness || typeof readiness !== "object") {
    throw new Error("Readiness probe returned invalid payload.");
  }
  if (readiness.overallState === "ERROR") {
    throw new Error("Readiness overallState is ERROR.");
  }

  return {
    boardSource: board.source,
    gameCount: Array.isArray(board.games) ? board.games.length : 0,
    readiness: readiness.overallState
  };
}

function rollback(previousUrl) {
  if (!previousUrl) {
    fail("Post-deploy probes failed and no previous ready deployment was found for rollback.");
  }

  console.warn(`[deploy:prod] Rolling back to previous deployment: ${previousUrl}`);
  run("npx", ["vercel", "promote", previousUrl, "--scope", EXPECTED_SCOPE]);
  run("npx", ["vercel", "alias", "set", previousUrl, CANONICAL_DOMAIN, "--scope", EXPECTED_SCOPE]);
}

async function main() {
  const link = loadProjectLink();
  console.log(`[deploy:prod] Linked project: ${link.projectName} (${link.projectId})`);

  const listOutput = run("npx", ["vercel", "list", "--prod", "--yes", "--scope", EXPECTED_SCOPE]);
  const previousReadyUrl = extractLastReadyDeployment(listOutput);

  const deployOutput = run("npx", [
    "vercel",
    "deploy",
    "--prod",
    "--yes",
    "--scope",
    EXPECTED_SCOPE
  ]);
  const newUrl = extractProductionUrl(deployOutput);
  if (!newUrl) {
    fail("Could not parse new production deployment URL.");
  }

  run("npx", ["vercel", "alias", "set", newUrl, CANONICAL_DOMAIN, "--scope", EXPECTED_SCOPE]);
  console.log(`[deploy:prod] Aliased ${CANONICAL_DOMAIN} -> ${newUrl}`);

  try {
    const probe = await runProbes(CANONICAL_DOMAIN);
    console.log(
      `[deploy:prod] Probes passed: source=${probe.boardSource} games=${probe.gameCount} readiness=${probe.readiness}`
    );
  } catch (error) {
    console.error(`[deploy:prod] Probe failure: ${error instanceof Error ? error.message : "unknown error"}`);
    rollback(previousReadyUrl);
    fail("Deployment rolled back after failed probes.");
  }
}

main();

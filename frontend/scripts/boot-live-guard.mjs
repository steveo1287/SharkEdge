import { spawn } from 'node:child_process';
import path from 'node:path';

const mode = process.argv[2] ?? 'dev';
const passthroughArgs = process.argv.slice(3).filter((arg) => arg !== '--skip-guard');

function flagEnabled(value) {
  if (!value) {
    return false;
  }
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function resolveNextArgs(targetMode) {
  switch (targetMode) {
    case 'dev':
      return ['dev'];
    case 'dev:turbopack':
      return ['dev', '--turbopack'];
    case 'start':
      return ['start'];
    default:
      throw new Error(`Unsupported boot mode: ${targetMode}`);
  }
}

function buildRescueArgs() {
  const args = [];

  if (process.env.SHARKEDGE_BACKEND_URL?.trim()) {
    args.push(`--backendUrl=${process.env.SHARKEDGE_BACKEND_URL.trim()}`);
  }
  if (process.env.SHARKEDGE_RESCUE_REFRESH?.trim()) {
    args.push(`--refresh=${process.env.SHARKEDGE_RESCUE_REFRESH.trim()}`);
  }
  if (process.env.SHARKEDGE_RESCUE_LEAGUES?.trim()) {
    args.push(`--leagues=${process.env.SHARKEDGE_RESCUE_LEAGUES.trim()}`);
  }
  if (process.env.SHARKEDGE_RESCUE_TIMEOUT_SECONDS?.trim()) {
    args.push(`--timeoutSeconds=${process.env.SHARKEDGE_RESCUE_TIMEOUT_SECONDS.trim()}`);
  }
  if (process.env.SHARKEDGE_RESCUE_INTERVAL_SECONDS?.trim()) {
    args.push(`--intervalSeconds=${process.env.SHARKEDGE_RESCUE_INTERVAL_SECONDS.trim()}`);
  }
  if (process.env.INTERNAL_API_KEY?.trim()) {
    args.push(`--apiKey=${process.env.INTERNAL_API_KEY.trim()}`);
  } else if (process.env.SHARKEDGE_API_KEY?.trim()) {
    args.push(`--apiKey=${process.env.SHARKEDGE_API_KEY.trim()}`);
  }
  if (flagEnabled(process.env.SHARKEDGE_RESCUE_SCRAPE)) {
    args.push('--scrape=true');
  }
  if (process.env.SHARKEDGE_RESCUE_FORCE?.trim()) {
    args.push(`--force=${process.env.SHARKEDGE_RESCUE_FORCE.trim()}`);
  }
  return args;
}

function runNodeScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit'
    });

    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', reject);
  });
}

function runNext(targetArgs) {
  const nextBin = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [nextBin, ...targetArgs, ...passthroughArgs], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: process.env.NEXT_TELEMETRY_DISABLED ?? '1'
      },
      stdio: 'inherit'
    });

    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', reject);
  });
}

async function main() {
  const skipGuard =
    process.argv.includes('--skip-guard') ||
    flagEnabled(process.env.SHARKEDGE_ALLOW_DEGRADED_BOOT) ||
    flagEnabled(process.env.SHARKEDGE_SKIP_RESCUE_GUARD);

  if (skipGuard) {
    console.warn('[boot] skipping live board guard because degraded boot is explicitly allowed');
    const exitCode = await runNext(resolveNextArgs(mode));
    process.exit(exitCode);
    return;
  }

  console.info('[boot] running rescue power guard before starting Next.js');
  const rescueScript = path.join(process.cwd(), 'scripts', 'rescue-power.mjs');
  const rescueExitCode = await runNodeScript(rescueScript, buildRescueArgs());

  if (rescueExitCode !== 0) {
    console.error('[boot] rescue guard failed; refusing to start the app in a fake-green state');
    console.error('[boot] fix the ingest/feed/board path or set SHARKEDGE_ALLOW_DEGRADED_BOOT=true for intentional degraded work');
    process.exit(rescueExitCode);
    return;
  }

  console.info('[boot] rescue guard passed; starting Next.js');
  const exitCode = await runNext(resolveNextArgs(mode));
  process.exit(exitCode);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

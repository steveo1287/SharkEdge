import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const projectRoot = process.cwd();
const tempBase = path.join(os.tmpdir(), "sharkedge-local-build");
const tempRoot = path.join(
  tempBase,
  `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
);
const buildDir = path.join(projectRoot, ".next");

// Resolve the Next.js binary by checking cwd/node_modules first, then
// walking up one level to support npm workspace setups where packages are
// hoisted to the workspace root (e.g. frontend/ lives inside a monorepo).
function resolveNextBin(root) {
  const local = path.join(root, "node_modules", "next", "dist", "bin", "next");
  if (existsSync(local)) return local;
  const parent = path.join(root, "..", "node_modules", "next", "dist", "bin", "next");
  if (existsSync(parent)) return parent;
  return local; // fallback so the error message stays useful
}

const nextBin = resolveNextBin(projectRoot);

function clean(dir) {
  try {
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  } catch {
    // Best-effort cleanup only. Temp mirrors can be locked briefly on Windows.
  }
}

function cleanTempBuilds(baseDir, currentDirName) {
  if (!existsSync(baseDir)) {
    return;
  }

  for (const entry of readdirSync(baseDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    if (currentDirName && entry.name === currentDirName) {
      continue;
    }

    clean(path.join(baseDir, entry.name));
  }
}

function runNextBuild(cwd) {
  return spawnSync(process.execPath, [nextBin, "build"], {
    cwd,
    stdio: "inherit",
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: "1"
    }
  });
}

const useTempMirror =
  process.platform === "win32" &&
  projectRoot.toLowerCase().includes("onedrive") &&
  !process.env.VERCEL;

if (!useTempMirror) {
  const result = runNextBuild(projectRoot);
  process.exit(result.status ?? 1);
}

mkdirSync(tempBase, { recursive: true });
cleanTempBuilds(tempBase);
console.log(`[build] using temp mirror at ${tempRoot}`);

cpSync(projectRoot, tempRoot, {
  recursive: true,
  filter(source) {
    const normalized = source.toLowerCase();
    if (normalized.includes(`${path.sep}.next`)) return false;
    if (normalized.includes(`${path.sep}node_modules`)) return false;
    if (normalized.includes(`${path.sep}.npm-cache`)) return false;
    if (normalized.includes(`${path.sep}.npm-cache-build`)) return false;
    if (normalized.includes(`${path.sep}.vercel`)) return false;
    if (normalized.endsWith("build-local.log")) return false;
    if (normalized.endsWith("tsconfig.tsbuildinfo")) return false;
    return true;
  }
});

symlinkSync(path.join(projectRoot, "node_modules"), path.join(tempRoot, "node_modules"), "junction");

const result = runNextBuild(tempRoot);
if (result.status !== 0) {
  clean(tempRoot);
  process.exit(result.status ?? 1);
}

clean(buildDir);
cpSync(path.join(tempRoot, ".next"), buildDir, { recursive: true });
clean(tempRoot);
console.log(`[build] copied artifacts back to ${buildDir}`);

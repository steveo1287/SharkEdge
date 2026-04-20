import { spawnSync } from "node:child_process";

type SupportedLeague = "NBA" | "NCAAB" | "MLB" | "NFL" | "NCAAF";
type SmokeArgs = {
  league: SupportedLeague;
  date: string;
  market: string;
  headless: boolean;
  previewOnly: boolean;
  dryRun: boolean;
};

const SPORT_BY_LEAGUE: Record<SupportedLeague, string> = {
  NBA: "basketball",
  NCAAB: "basketball",
  MLB: "baseball",
  NFL: "football",
  NCAAF: "football"
};

function parseArgs(argv: string[]): SmokeArgs {
  const raw = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      raw.set(key, "true");
      continue;
    }

    raw.set(key, next);
    index += 1;
  }

  const league = (raw.get("league")?.toUpperCase() ?? "NBA") as SupportedLeague;
  if (!(league in SPORT_BY_LEAGUE)) {
    throw new Error(`Unsupported league '${league}'. Use NBA, NCAAB, MLB, NFL, or NCAAF.`);
  }

  const date = raw.get("date") ?? new Date().toISOString().slice(0, 10).replace(/-/g, "");
  if (!/^\d{8}$/.test(date)) {
    throw new Error(`Invalid date '${date}'. Use YYYYMMDD.`);
  }

  return {
    league,
    date,
    market: raw.get("market") ?? "moneyline",
    headless: raw.get("headless") !== "false",
    previewOnly: raw.get("preview-only") === "true",
    dryRun: raw.get("dry-run") !== "false"
  };
}

function resolveCommand(args: SmokeArgs) {
  const sport = SPORT_BY_LEAGUE[args.league];
  const command = [
    "oddsharvester",
    "upcoming",
    "-s",
    sport,
    "-d",
    args.date,
    "-m",
    args.market
  ];

  if (args.headless) {
    command.push("--headless");
  }

  if (args.previewOnly) {
    command.push("--preview-only");
  }

  return command;
}

function ensureCliPresent() {
  const check = spawnSync("oddsharvester", ["--help"], {
    stdio: "ignore",
    shell: process.platform === "win32"
  });

  if (check.error || check.status !== 0) {
    throw new Error(
      "oddsharvester CLI is not installed. Install it first with 'pip install oddsharvester'."
    );
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = resolveCommand(args);

  console.log("[oddsharvester-smoke] league:", args.league);
  console.log("[oddsharvester-smoke] date:", args.date);
  console.log("[oddsharvester-smoke] market:", args.market);
  console.log("[oddsharvester-smoke] command:", command.join(" "));

  if (args.dryRun) {
    console.log("[oddsharvester-smoke] dry run only. Pass --dry-run false to execute.");
    return;
  }

  ensureCliPresent();

  const run = spawnSync(command[0], command.slice(1), {
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  if (run.error) {
    throw run.error;
  }

  if (typeof run.status === "number" && run.status !== 0) {
    process.exit(run.status);
  }
}

main();

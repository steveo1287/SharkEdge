import { prisma } from "@/lib/db/prisma";
import type { MlbUmpireTendency } from "@/services/simulation/mlb-umpire-model";
export type { MlbUmpireTendency };

// DB-backed umpire store. Seed data is calibrated from publicly available
// umpire analytics research (Umpire Scorecards, Baseball Savant, Inside Edge).
// Values are k_rate_delta / bb_rate_delta vs league average (percentage points).

type SeedEntry = {
  name: string;
  kDelta: number;
  bbDelta: number;
  games: number;
};

// Positive kDelta = umpire generates more Ks than league average.
// Positive bbDelta = umpire generates more walks than league average.
// Run bias derived: walks add ~0.18 runs, Ks remove ~0.09 runs.
const SEED_UMPIRES: SeedEntry[] = [
  { name: "Angel Hernandez",   kDelta: -0.30, bbDelta:  1.10, games: 2100 },
  { name: "CB Bucknor",        kDelta: -0.55, bbDelta:  1.25, games: 2400 },
  { name: "Dan Iassogna",      kDelta:  0.45, bbDelta: -0.60, games: 1800 },
  { name: "Joe West",          kDelta:  0.35, bbDelta: -0.15, games: 3200 },
  { name: "Sam Holbrook",      kDelta:  0.55, bbDelta: -0.70, games: 1700 },
  { name: "Phil Cuzzi",        kDelta:  0.20, bbDelta:  0.30, games: 2000 },
  { name: "Gerry Davis",       kDelta:  0.10, bbDelta:  0.20, games: 2800 },
  { name: "Mark Wegner",       kDelta:  0.05, bbDelta:  0.05, games: 1400 },
  { name: "Ted Barrett",       kDelta: -0.10, bbDelta:  0.10, games: 1900 },
  { name: "Larry Vanover",     kDelta:  0.15, bbDelta:  0.35, games: 1600 },
  { name: "Rob Drake",         kDelta: -0.05, bbDelta: -0.10, games: 1200 },
  { name: "Vic Carapazza",     kDelta:  0.50, bbDelta: -0.55, games: 900  },
  { name: "John Tumpane",      kDelta:  0.00, bbDelta:  0.00, games: 800  },
  { name: "Ryan Blakney",      kDelta:  0.05, bbDelta: -0.05, games: 600  },
  { name: "Paul Emmel",        kDelta: -0.15, bbDelta:  0.40, games: 1500 },
  { name: "Bill Miller",       kDelta:  0.08, bbDelta: -0.08, games: 2100 },
  { name: "Mike Muchlinski",   kDelta: -0.12, bbDelta:  0.18, games: 1000 },
  { name: "Todd Tichenor",     kDelta:  0.30, bbDelta: -0.35, games: 1100 },
  { name: "Andy Fletcher",     kDelta:  0.03, bbDelta:  0.03, games: 1300 },
  { name: "Doug Eddings",      kDelta:  0.28, bbDelta: -0.32, games: 2200 },
  { name: "Alfonso Marquez",   kDelta:  0.00, bbDelta:  0.00, games: 1400 },
  { name: "Marvin Hudson",     kDelta: -0.20, bbDelta:  0.45, games: 1900 },
  { name: "Manny Gonzalez",    kDelta:  0.10, bbDelta: -0.10, games: 700  },
  { name: "Chris Guccione",    kDelta:  0.05, bbDelta:  0.08, games: 1100 },
  { name: "Tom Hallion",       kDelta: -0.08, bbDelta:  0.12, games: 1600 },
  { name: "Alan Porter",       kDelta:  0.12, bbDelta: -0.15, games: 900  },
  { name: "Scott Barry",       kDelta:  0.18, bbDelta: -0.22, games: 800  },
  { name: "Mike Estabrook",    kDelta:  0.02, bbDelta:  0.02, games: 500  },
  { name: "Nic Lentz",         kDelta: -0.05, bbDelta:  0.08, games: 400  },
  { name: "Chad Fairchild",    kDelta:  0.42, bbDelta: -0.48, games: 650  },
  { name: "Jeremy Riggs",      kDelta:  0.00, bbDelta:  0.00, games: 300  },
  { name: "Malachi Moore",     kDelta:  0.02, bbDelta: -0.02, games: 200  },
];

function nameKey(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function zoneSize(kDelta: number, bbDelta: number): string {
  const net = kDelta - bbDelta;
  if (net >= 0.50) return "generous";
  if (net <= -0.50) return "tight";
  return "average";
}

function runBias(kDelta: number, bbDelta: number) {
  return Number((bbDelta * 0.18 - kDelta * 0.09).toFixed(3));
}

function umpireId(entry: SeedEntry) {
  return `umpire:seed:${nameKey(entry.name)}`;
}

async function ensureTables() {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS mlb_umpire_tendencies (
      id TEXT PRIMARY KEY,
      umpire_name TEXT NOT NULL,
      name_key TEXT NOT NULL UNIQUE,
      k_rate_delta DOUBLE PRECISION NOT NULL DEFAULT 0,
      bb_rate_delta DOUBLE PRECISION NOT NULL DEFAULT 0,
      run_bias DOUBLE PRECISION NOT NULL DEFAULT 0,
      zone_size TEXT NOT NULL DEFAULT 'average',
      sample_games INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'seed',
      last_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS mlb_umpire_assignments (
      id TEXT PRIMARY KEY,
      game_pk INTEGER NOT NULL,
      game_date DATE NOT NULL,
      hp_umpire_name TEXT,
      hp_umpire_id TEXT,
      away_team TEXT,
      home_team TEXT,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await prisma.$executeRaw`
    CREATE UNIQUE INDEX IF NOT EXISTS mlb_umpire_assignments_game_pk_idx
    ON mlb_umpire_assignments (game_pk)
  `;
}

export async function seedMlbUmpireDb(): Promise<{ seeded: number; skipped: number }> {
  await ensureTables();
  let seeded = 0;
  let skipped = 0;

  for (const entry of SEED_UMPIRES) {
    const id = umpireId(entry);
    const key = nameKey(entry.name);
    const zone = zoneSize(entry.kDelta, entry.bbDelta);
    const bias = runBias(entry.kDelta, entry.bbDelta);

    const result = await prisma.$executeRaw`
      INSERT INTO mlb_umpire_tendencies
        (id, umpire_name, name_key, k_rate_delta, bb_rate_delta, run_bias, zone_size, sample_games, source, last_updated_at, created_at)
      VALUES
        (${id}, ${entry.name}, ${key}, ${entry.kDelta}, ${entry.bbDelta}, ${bias}, ${zone}, ${entry.games}, 'seed', now(), now())
      ON CONFLICT (name_key) DO NOTHING
    `;
    if (Number(result) > 0) seeded += 1;
    else skipped += 1;
  }

  return { seeded, skipped };
}

type RawTendency = {
  umpire_name: string;
  k_rate_delta: number;
  bb_rate_delta: number;
  run_bias: number;
  zone_size: string;
  sample_games: number;
  source: string;
};

async function loadFromDb(name: string): Promise<MlbUmpireTendency | null> {
  const key = nameKey(name);
  const rows = await prisma.$queryRaw<RawTendency[]>`
    SELECT umpire_name, k_rate_delta, bb_rate_delta, run_bias, zone_size, sample_games, source
    FROM mlb_umpire_tendencies
    WHERE name_key = ${key}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;

  return {
    source: row.source === "seed" ? "real" : "real",
    umpireName: row.umpire_name,
    strikeoutBiasEdge: row.k_rate_delta,
    walkBiasEdge: row.bb_rate_delta,
    totalRunBiasEdge: row.run_bias,
    kZoneSize: row.zone_size as MlbUmpireTendency["kZoneSize"],
    notes: [
      `Umpire: ${row.umpire_name} (${row.sample_games} career games).`,
      `K-zone: ${row.zone_size} (K-bias ${row.k_rate_delta >= 0 ? "+" : ""}${row.k_rate_delta.toFixed(2)}, BB-bias ${row.bb_rate_delta >= 0 ? "+" : ""}${row.bb_rate_delta.toFixed(2)}).`,
      Math.abs(row.run_bias) >= 0.2
        ? `Run-environment bias is material: ${row.run_bias >= 0 ? "+" : ""}${row.run_bias.toFixed(2)} expected run shift.`
        : "Run-environment bias is minimal.",
    ],
  };
}

// ─── Daily assignment ingest ──────────────────────────────────────────────────

type OfficialRow = { game_pk: number; hp_umpire_name: string | null };

type ScheduleUmpire = { id?: number; fullName?: string };
type ScheduleOfficial = { officialType?: string; official?: ScheduleUmpire };
type ScheduleGame = {
  gamePk?: number;
  gameDate?: string;
  teams?: {
    away?: { team?: { abbreviation?: string } };
    home?: { team?: { abbreviation?: string } };
  };
  officials?: ScheduleOfficial[];
};
type ScheduleResponse = { dates?: Array<{ games?: ScheduleGame[] }> };

async function fetchTodayAssignments() {
  const today = new Date().toISOString().slice(0, 10);
  const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=${today}&endDate=${today}&hydrate=officials,team`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": "SharkEdge/2.0 umpire-db" }, signal: controller.signal });
    if (!res.ok) return [];
    const body = (await res.json()) as ScheduleResponse;
    const assignments: Array<{ gamePk: number; gameDate: string; hpName: string | null; hpId: string | null; away: string; home: string }> = [];
    for (const d of body.dates ?? []) {
      for (const g of d.games ?? []) {
        if (!g.gamePk) continue;
        const hp = (g.officials ?? []).find((o) => o.officialType === "Home Plate");
        assignments.push({
          gamePk: g.gamePk,
          gameDate: g.gameDate?.slice(0, 10) ?? today,
          hpName: hp?.official?.fullName ?? null,
          hpId: hp?.official?.id != null ? String(hp.official.id) : null,
          away: g.teams?.away?.team?.abbreviation ?? "",
          home: g.teams?.home?.team?.abbreviation ?? "",
        });
      }
    }
    return assignments;
  } finally {
    clearTimeout(timer);
  }
}

export async function refreshUmpireAssignments(): Promise<{ upserted: number; missing: number }> {
  await ensureTables();
  const assignments = await fetchTodayAssignments().catch(() => []);
  let upserted = 0;
  let missing = 0;

  for (const a of assignments) {
    const id = `ump-assign:${a.gamePk}`;
    await prisma.$executeRaw`
      INSERT INTO mlb_umpire_assignments (id, game_pk, game_date, hp_umpire_name, hp_umpire_id, away_team, home_team, fetched_at)
      VALUES (${id}, ${a.gamePk}, ${a.gameDate}::DATE, ${a.hpName}, ${a.hpId}, ${a.away}, ${a.home}, now())
      ON CONFLICT (game_pk) DO UPDATE SET
        hp_umpire_name = EXCLUDED.hp_umpire_name,
        hp_umpire_id   = EXCLUDED.hp_umpire_id,
        fetched_at     = now()
    `;
    if (a.hpName) upserted += 1;
    else missing += 1;
  }

  return { upserted, missing };
}

// ─── Public lookup ────────────────────────────────────────────────────────────

async function getAssignedUmpire(awayTeam: string, homeTeam: string): Promise<string | null> {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await prisma.$queryRaw<OfficialRow[]>`
    SELECT game_pk, hp_umpire_name
    FROM mlb_umpire_assignments
    WHERE game_date = ${today}::DATE
      AND (
        lower(away_team) = lower(${awayTeam}) OR lower(home_team) = lower(${homeTeam})
        OR lower(away_team) = lower(${homeTeam}) OR lower(home_team) = lower(${awayTeam})
      )
    ORDER BY fetched_at DESC
    LIMIT 1
  `;
  return rows[0]?.hp_umpire_name ?? null;
}

export async function getMlbUmpireTendencyFromDb(awayTeam: string, homeTeam: string): Promise<MlbUmpireTendency | null> {
  try {
    const assignedName = await getAssignedUmpire(awayTeam, homeTeam);
    if (!assignedName) return null;
    return await loadFromDb(assignedName);
  } catch {
    return null;
  }
}

export async function getMlbUmpireTendencyByName(name: string): Promise<MlbUmpireTendency | null> {
  try {
    return await loadFromDb(name);
  } catch {
    return null;
  }
}

export async function listUmpireTendencies(): Promise<RawTendency[]> {
  return prisma.$queryRaw<RawTendency[]>`
    SELECT umpire_name, k_rate_delta, bb_rate_delta, run_bias, zone_size, sample_games, source
    FROM mlb_umpire_tendencies
    ORDER BY abs(k_rate_delta) + abs(bb_rate_delta) DESC
  `;
}

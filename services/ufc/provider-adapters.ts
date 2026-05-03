import type { UfcRealDataSnapshot, UfcRealFightSnapshot, UfcRealFighterSnapshot } from "@/services/ufc/real-data-ingestion";

export type UfcProviderKey = "odds-api" | "ufcstats" | "fightmatrix" | "manual-scouting" | "composite";

export type UfcProviderHealth = {
  provider: UfcProviderKey;
  configured: boolean;
  ready: boolean;
  missing: string[];
  notes: string[];
};

export type UfcOddsApiEvent = {
  id: string;
  commence_time: string;
  home_team?: string | null;
  away_team?: string | null;
  bookmakers?: Array<{
    key?: string;
    title?: string;
    markets?: Array<{
      key?: string;
      outcomes?: Array<{ name: string; price: number }>;
    }>;
  }>;
};

export type UfcStatsFighterSnapshot = Partial<UfcRealFighterSnapshot> & {
  sourceId: string;
  name: string;
};

export type FightMatrixStrengthSnapshot = {
  fighterSourceId: string;
  opponentAdjustedStrength: number;
  sourceRank?: number | null;
  metricLabel?: string | null;
};

export type ManualProspectSnapshot = {
  fighterSourceId: string;
  combatBase?: string | null;
  coldStartActive?: boolean;
  amateurSignal?: number;
  promotionTierSignal?: number;
  scoutingTags?: string[];
  notes?: string | null;
};

function requireDate(value: string, label: string) {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) throw new Error(`Invalid ${label}: ${value}`);
  return value;
}

function normalizeName(value: string | null | undefined) {
  return String(value ?? "").trim();
}

function fighterIdFromName(name: string) {
  return normalizeName(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function latestMoneyline(event: UfcOddsApiEvent, fighterName: string) {
  for (const book of event.bookmakers ?? []) {
    const market = (book.markets ?? []).find((item) => item.key === "h2h");
    const outcome = market?.outcomes?.find((item) => normalizeName(item.name).toLowerCase() === normalizeName(fighterName).toLowerCase());
    if (typeof outcome?.price === "number" && Number.isFinite(outcome.price)) return outcome.price;
  }
  return null;
}

export function normalizeOddsApiMmaEvents(args: { events: UfcOddsApiEvent[]; snapshotAt: string; modelVersion?: string }): UfcRealDataSnapshot {
  requireDate(args.snapshotAt, "snapshotAt");
  const fights: UfcRealFightSnapshot[] = args.events.map((event) => {
    const fighterAName = normalizeName(event.away_team);
    const fighterBName = normalizeName(event.home_team);
    if (!fighterAName || !fighterBName) throw new Error(`Odds API event ${event.id} is missing home_team/away_team fighters.`);
    return {
      sourceFightId: event.id,
      eventLabel: `${fighterAName} vs ${fighterBName}`,
      fightDate: requireDate(event.commence_time, `commence_time for ${event.id}`),
      scheduledRounds: 3,
      fighterA: { sourceId: fighterIdFromName(fighterAName), name: fighterAName },
      fighterB: { sourceId: fighterIdFromName(fighterBName), name: fighterBName },
      marketOddsAOpen: latestMoneyline(event, fighterAName),
      marketOddsBOpen: latestMoneyline(event, fighterBName)
    };
  });
  return { sourceKey: "odds-api", modelVersion: args.modelVersion ?? "ufc-fight-iq-v1", snapshotAt: args.snapshotAt, fights };
}

export function mergeUfcStatsIntoSnapshot(snapshot: UfcRealDataSnapshot, fighters: UfcStatsFighterSnapshot[]): UfcRealDataSnapshot {
  const byId = new Map(fighters.map((fighter) => [fighter.sourceId, fighter]));
  const merge = (fighter: UfcRealFighterSnapshot): UfcRealFighterSnapshot => ({ ...fighter, ...(byId.get(fighter.sourceId) ?? {}) });
  return { ...snapshot, sourceKey: `${snapshot.sourceKey}+ufcstats`, fights: snapshot.fights.map((fight) => ({ ...fight, fighterA: merge(fight.fighterA), fighterB: merge(fight.fighterB) })) };
}

export function mergeFightMatrixStrengthIntoSnapshot(snapshot: UfcRealDataSnapshot, strengths: FightMatrixStrengthSnapshot[]): UfcRealDataSnapshot {
  const byId = new Map(strengths.map((item) => [item.fighterSourceId, item]));
  const merge = (fighter: UfcRealFighterSnapshot): UfcRealFighterSnapshot => {
    const strength = byId.get(fighter.sourceId);
    if (!strength) return fighter;
    return {
      ...fighter,
      opponentAdjustedStrength: strength.opponentAdjustedStrength,
      feature: { ...(fighter.feature ?? {}), fightMatrixRank: strength.sourceRank ?? null, fightMatrixMetricLabel: strength.metricLabel ?? null }
    };
  };
  return { ...snapshot, sourceKey: `${snapshot.sourceKey}+fightmatrix`, fights: snapshot.fights.map((fight) => ({ ...fight, fighterA: merge(fight.fighterA), fighterB: merge(fight.fighterB) })) };
}

export function mergeManualProspectsIntoSnapshot(snapshot: UfcRealDataSnapshot, prospects: ManualProspectSnapshot[]): UfcRealDataSnapshot {
  const byId = new Map(prospects.map((item) => [item.fighterSourceId, item]));
  const merge = (fighter: UfcRealFighterSnapshot): UfcRealFighterSnapshot => {
    const prospect = byId.get(fighter.sourceId);
    if (!prospect) return fighter;
    return {
      ...fighter,
      combatBase: prospect.combatBase ?? fighter.combatBase ?? null,
      coldStartActive: prospect.coldStartActive ?? fighter.coldStartActive,
      feature: {
        ...(fighter.feature ?? {}),
        amateurSignal: prospect.amateurSignal ?? null,
        promotionTierSignal: prospect.promotionTierSignal ?? null,
        scoutingTags: prospect.scoutingTags ?? [],
        scoutingNotes: prospect.notes ?? null
      }
    };
  };
  return { ...snapshot, sourceKey: `${snapshot.sourceKey}+manual-scouting`, fights: snapshot.fights.map((fight) => ({ ...fight, fighterA: merge(fight.fighterA), fighterB: merge(fight.fighterB) })) };
}

export function validateProviderSnapshot(snapshot: UfcRealDataSnapshot) {
  const errors: string[] = [];
  const snapshotTime = new Date(snapshot.snapshotAt).getTime();
  if (Number.isNaN(snapshotTime)) errors.push("snapshotAt is invalid");
  if (!snapshot.fights.length) errors.push("snapshot has no fights");
  for (const fight of snapshot.fights) {
    const fightTime = new Date(fight.fightDate).getTime();
    if (Number.isNaN(fightTime)) errors.push(`${fight.sourceFightId}: fightDate is invalid`);
    if (!fight.fighterA?.sourceId || !fight.fighterB?.sourceId) errors.push(`${fight.sourceFightId}: missing fighter IDs`);
    if (fight.fighterA?.sourceId === fight.fighterB?.sourceId) errors.push(`${fight.sourceFightId}: duplicate fighter IDs`);
    if (snapshotTime > fightTime) errors.push(`${fight.sourceFightId}: snapshot is after fight date`);
  }
  return { ok: errors.length === 0, errors };
}

export function getUfcProviderReadiness(env: Record<string, string | undefined> = process.env): UfcProviderHealth[] {
  const oddsMissing = ["ODDS_API_KEY"].filter((key) => !env[key]);
  return [
    { provider: "odds-api", configured: oddsMissing.length === 0, ready: oddsMissing.length === 0, missing: oddsMissing, notes: ["Used for MMA/UFC moneyline odds and market-implied probability."] },
    { provider: "ufcstats", configured: true, ready: true, missing: [], notes: ["Adapter accepts structured fighter stat snapshots. Add source fetcher separately if scraping/API is approved."] },
    { provider: "fightmatrix", configured: true, ready: true, missing: [], notes: ["Adapter accepts imported opponent-strength snapshots."] },
    { provider: "manual-scouting", configured: true, ready: true, missing: [], notes: ["Manual prospect scouting import is supported for cold-start fighters."] }
  ];
}

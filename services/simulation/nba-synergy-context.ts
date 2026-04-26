import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import { normalizeNbaTeam } from "@/services/simulation/nba-team-analytics";

export type NbaSynergyContext = {
  awayTeam: string;
  homeTeam: string;
  source: "real" | "synthetic";
  coachAdjustmentEdge: number;
  timeoutAtoEdge: number;
  rotationStabilityEdge: number;
  lineupContinuityEdge: number;
  pickRollBallHandlerEdge: number;
  pickRollRollManEdge: number;
  isolationEdge: number;
  postUpEdge: number;
  spotUpEdge: number;
  transitionEdge: number;
  offensiveReboundEdge: number;
  rimFrequencyEdge: number;
  cornerThreeEdge: number;
  pullUpThreeEdge: number;
  paintTouchEdge: number;
  driveKickEdge: number;
  opponentRimDeterrenceEdge: number;
  opponentSwitchabilityEdge: number;
  opponentPointOfAttackEdge: number;
  opponentCloseoutEdge: number;
  foulDisciplineEdge: number;
  turnoverCreationEdge: number;
  lateGameExecutionEdge: number;
  benchCreationEdge: number;
  starCreationEdge: number;
  synergySideEdge: number;
  synergyTotalEdge: number;
  synergyVolatility: number;
  confidenceAdjustment: number;
  notes: string[];
};

type RawSynergy = Partial<NbaSynergyContext> & {
  away?: string;
  home?: string;
  awayTeam?: string;
  homeTeam?: string;
};

const CACHE_KEY = "nba:synergy-context:v1";
const CACHE_TTL_SECONDS = 60 * 60 * 6;

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return hash;
}

function seedUnit(seed: number) {
  return (seed % 1000) / 1000;
}

function range(seed: number, min: number, max: number) {
  return Number((min + seedUnit(seed) * (max - min)).toFixed(2));
}

function num(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

function keyFor(awayTeam: string, homeTeam: string) {
  return `${normalizeNbaTeam(awayTeam)}@${normalizeNbaTeam(homeTeam)}`;
}

function computeDerived(base: Omit<NbaSynergyContext, "synergySideEdge" | "synergyTotalEdge" | "synergyVolatility" | "confidenceAdjustment" | "notes">): Pick<NbaSynergyContext, "synergySideEdge" | "synergyTotalEdge" | "synergyVolatility" | "confidenceAdjustment" | "notes"> {
  const creationEdge = base.starCreationEdge * 0.62 + base.benchCreationEdge * 0.28 + base.driveKickEdge * 0.24;
  const shotProfileEdge = base.rimFrequencyEdge * 0.34 + base.cornerThreeEdge * 0.38 + base.paintTouchEdge * 0.26 + base.pullUpThreeEdge * 0.16;
  const schemeEdge = base.opponentPointOfAttackEdge * 0.36 + base.opponentSwitchabilityEdge * 0.28 + base.opponentRimDeterrenceEdge * 0.28 + base.opponentCloseoutEdge * 0.22;
  const coachingEdge = base.coachAdjustmentEdge * 0.44 + base.timeoutAtoEdge * 0.26 + base.rotationStabilityEdge * 0.28 + base.lineupContinuityEdge * 0.3;
  const playTypeEdge = base.pickRollBallHandlerEdge * 0.22 + base.pickRollRollManEdge * 0.18 + base.isolationEdge * 0.16 + base.postUpEdge * 0.08 + base.spotUpEdge * 0.24 + base.transitionEdge * 0.2;
  const disciplineEdge = base.foulDisciplineEdge * 0.22 + base.turnoverCreationEdge * 0.3 + base.lateGameExecutionEdge * 0.25;

  const synergySideEdge = Number((creationEdge + shotProfileEdge + schemeEdge + coachingEdge + playTypeEdge + disciplineEdge).toFixed(2));
  const synergyTotalEdge = Number((base.transitionEdge * 0.55 + base.spotUpEdge * 0.38 + base.cornerThreeEdge * 0.42 + base.rimFrequencyEdge * 0.34 + base.foulDisciplineEdge * 0.25 + base.offensiveReboundEdge * 0.28 - base.opponentRimDeterrenceEdge * 0.22).toFixed(2));
  const synergyVolatility = Number((1 + Math.abs(base.pullUpThreeEdge) / 13 + Math.abs(base.isolationEdge) / 16 + Math.abs(base.rotationStabilityEdge < 0 ? base.rotationStabilityEdge : 0) / 14).toFixed(2));
  const confidenceAdjustment = Number((Math.abs(synergySideEdge) > 2 ? 2.5 : 0.5) + Math.max(0, base.lineupContinuityEdge) * 0.35 - Math.max(0, synergyVolatility - 1.18) * 6).toFixed(2);

  return {
    synergySideEdge,
    synergyTotalEdge,
    synergyVolatility,
    confidenceAdjustment,
    notes: [
      `Synergy side edge ${synergySideEdge > 0 ? "+" : ""}${synergySideEdge}.`,
      `Synergy total edge ${synergyTotalEdge > 0 ? "+" : ""}${synergyTotalEdge}.`,
      synergyVolatility >= 1.18 ? "Synergy volatility is elevated by creation/shot-profile instability." : "Synergy volatility is contained."
    ]
  };
}

function syntheticContext(awayTeam: string, homeTeam: string): NbaSynergyContext {
  const seed = hashString(`${awayTeam}@${homeTeam}:synergy`);
  const base = {
    awayTeam,
    homeTeam,
    source: "synthetic" as const,
    coachAdjustmentEdge: range(seed >>> 1, -1.2, 1.2),
    timeoutAtoEdge: range(seed >>> 2, -0.8, 0.8),
    rotationStabilityEdge: range(seed >>> 3, -1.1, 1.1),
    lineupContinuityEdge: range(seed >>> 4, -1.2, 1.2),
    pickRollBallHandlerEdge: range(seed >>> 5, -1.4, 1.4),
    pickRollRollManEdge: range(seed >>> 6, -1.1, 1.1),
    isolationEdge: range(seed >>> 7, -1.0, 1.0),
    postUpEdge: range(seed >>> 8, -0.6, 0.6),
    spotUpEdge: range(seed >>> 9, -1.3, 1.3),
    transitionEdge: range(seed >>> 10, -1.2, 1.2),
    offensiveReboundEdge: range(seed >>> 11, -1.0, 1.0),
    rimFrequencyEdge: range(seed >>> 12, -1.2, 1.2),
    cornerThreeEdge: range(seed >>> 13, -1.1, 1.1),
    pullUpThreeEdge: range(seed >>> 14, -1.2, 1.2),
    paintTouchEdge: range(seed >>> 15, -1.0, 1.0),
    driveKickEdge: range(seed >>> 16, -1.0, 1.0),
    opponentRimDeterrenceEdge: range(seed >>> 17, -1.1, 1.1),
    opponentSwitchabilityEdge: range(seed >>> 18, -1.0, 1.0),
    opponentPointOfAttackEdge: range(seed >>> 19, -1.1, 1.1),
    opponentCloseoutEdge: range(seed >>> 20, -1.0, 1.0),
    foulDisciplineEdge: range(seed >>> 21, -0.9, 0.9),
    turnoverCreationEdge: range(seed >>> 22, -1.0, 1.0),
    lateGameExecutionEdge: range(seed >>> 23, -0.9, 0.9),
    benchCreationEdge: range(seed >>> 24, -1.2, 1.2),
    starCreationEdge: range(seed >>> 25, -1.8, 1.8)
  };
  return { ...base, ...computeDerived(base) };
}

function rowsFromBody(body: any): RawSynergy[] {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.games)) return body.games;
  if (Array.isArray(body?.matchups)) return body.matchups;
  if (Array.isArray(body?.data)) return body.data;
  return [];
}

function normalizeRaw(row: RawSynergy): NbaSynergyContext | null {
  const awayTeam = row.awayTeam ?? row.away;
  const homeTeam = row.homeTeam ?? row.home;
  if (!awayTeam || !homeTeam) return null;
  const baseSynthetic = syntheticContext(awayTeam, homeTeam);
  const base = {
    ...baseSynthetic,
    source: "real" as const,
    coachAdjustmentEdge: num(row.coachAdjustmentEdge, baseSynthetic.coachAdjustmentEdge),
    timeoutAtoEdge: num(row.timeoutAtoEdge, baseSynthetic.timeoutAtoEdge),
    rotationStabilityEdge: num(row.rotationStabilityEdge, baseSynthetic.rotationStabilityEdge),
    lineupContinuityEdge: num(row.lineupContinuityEdge, baseSynthetic.lineupContinuityEdge),
    pickRollBallHandlerEdge: num(row.pickRollBallHandlerEdge, baseSynthetic.pickRollBallHandlerEdge),
    pickRollRollManEdge: num(row.pickRollRollManEdge, baseSynthetic.pickRollRollManEdge),
    isolationEdge: num(row.isolationEdge, baseSynthetic.isolationEdge),
    postUpEdge: num(row.postUpEdge, baseSynthetic.postUpEdge),
    spotUpEdge: num(row.spotUpEdge, baseSynthetic.spotUpEdge),
    transitionEdge: num(row.transitionEdge, baseSynthetic.transitionEdge),
    offensiveReboundEdge: num(row.offensiveReboundEdge, baseSynthetic.offensiveReboundEdge),
    rimFrequencyEdge: num(row.rimFrequencyEdge, baseSynthetic.rimFrequencyEdge),
    cornerThreeEdge: num(row.cornerThreeEdge, baseSynthetic.cornerThreeEdge),
    pullUpThreeEdge: num(row.pullUpThreeEdge, baseSynthetic.pullUpThreeEdge),
    paintTouchEdge: num(row.paintTouchEdge, baseSynthetic.paintTouchEdge),
    driveKickEdge: num(row.driveKickEdge, baseSynthetic.driveKickEdge),
    opponentRimDeterrenceEdge: num(row.opponentRimDeterrenceEdge, baseSynthetic.opponentRimDeterrenceEdge),
    opponentSwitchabilityEdge: num(row.opponentSwitchabilityEdge, baseSynthetic.opponentSwitchabilityEdge),
    opponentPointOfAttackEdge: num(row.opponentPointOfAttackEdge, baseSynthetic.opponentPointOfAttackEdge),
    opponentCloseoutEdge: num(row.opponentCloseoutEdge, baseSynthetic.opponentCloseoutEdge),
    foulDisciplineEdge: num(row.foulDisciplineEdge, baseSynthetic.foulDisciplineEdge),
    turnoverCreationEdge: num(row.turnoverCreationEdge, baseSynthetic.turnoverCreationEdge),
    lateGameExecutionEdge: num(row.lateGameExecutionEdge, baseSynthetic.lateGameExecutionEdge),
    benchCreationEdge: num(row.benchCreationEdge, baseSynthetic.benchCreationEdge),
    starCreationEdge: num(row.starCreationEdge, baseSynthetic.starCreationEdge)
  };
  return { ...base, ...computeDerived(base), notes: Array.isArray(row.notes) ? row.notes : computeDerived(base).notes };
}

async function fetchContexts() {
  const cached = await readHotCache<Record<string, NbaSynergyContext>>(CACHE_KEY);
  if (cached) return cached;
  const url = process.env.NBA_SYNERGY_CONTEXT_URL?.trim();
  if (!url) return null;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const body = await response.json();
    const contexts: Record<string, NbaSynergyContext> = {};
    for (const row of rowsFromBody(body)) {
      const context = normalizeRaw(row);
      if (context) contexts[keyFor(context.awayTeam, context.homeTeam)] = context;
    }
    if (Object.keys(contexts).length) {
      await writeHotCache(CACHE_KEY, contexts, CACHE_TTL_SECONDS);
      return contexts;
    }
  } catch {
    return null;
  }
  return null;
}

export async function getNbaSynergyContext(awayTeam: string, homeTeam: string): Promise<NbaSynergyContext> {
  const contexts = await fetchContexts();
  return contexts?.[keyFor(awayTeam, homeTeam)] ?? syntheticContext(awayTeam, homeTeam);
}

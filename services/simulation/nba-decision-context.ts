import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import { normalizeNbaTeam } from "@/services/simulation/nba-team-analytics";

export type NbaDecisionContext = {
  awayTeam: string;
  homeTeam: string;
  source: "real" | "synthetic";
  scheduleFatigueEdge: number;
  travelEdge: number;
  altitudeEdge: number;
  restAdvantage: number;
  refereePaceBias: number;
  refereeFoulBias: number;
  marketPublicBias: number;
  sharpSplitSignal: number;
  recentShotQualityEdge: number;
  recentRimPressureEdge: number;
  defensiveSchemeEdge: number;
  matchupSizeEdge: number;
  benchDepthEdge: number;
  clutchEdge: number;
  garbageTimeRisk: number;
  blowoutRisk: number;
  decisionEdge: number;
  totalContextEdge: number;
  volatilityContext: number;
  confidenceAdjustment: number;
  notes: string[];
};

type RawDecisionContext = Partial<NbaDecisionContext> & {
  away?: string;
  home?: string;
  awayTeam?: string;
  homeTeam?: string;
};

const CACHE_KEY = "nba:decision-context:v1";
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

function syntheticContext(awayTeam: string, homeTeam: string): NbaDecisionContext {
  const seed = hashString(`${awayTeam}@${homeTeam}:decision-context`);
  const scheduleFatigueEdge = range(seed >>> 1, -1.8, 1.8);
  const travelEdge = range(seed >>> 2, -1.4, 1.4);
  const altitudeEdge = normalizeNbaTeam(homeTeam).includes("denver") ? 0.8 : range(seed >>> 3, -0.25, 0.25);
  const restAdvantage = range(seed >>> 4, -1.3, 1.3);
  const refereePaceBias = range(seed >>> 5, -0.8, 0.8);
  const refereeFoulBias = range(seed >>> 6, -0.7, 0.7);
  const marketPublicBias = range(seed >>> 7, -1.1, 1.1);
  const sharpSplitSignal = range(seed >>> 8, -1.4, 1.4);
  const recentShotQualityEdge = range(seed >>> 9, -1.9, 1.9);
  const recentRimPressureEdge = range(seed >>> 10, -1.4, 1.4);
  const defensiveSchemeEdge = range(seed >>> 11, -1.6, 1.6);
  const matchupSizeEdge = range(seed >>> 12, -1.1, 1.1);
  const benchDepthEdge = range(seed >>> 13, -1.2, 1.2);
  const clutchEdge = range(seed >>> 14, -0.9, 0.9);
  const garbageTimeRisk = range(seed >>> 15, 0, 1);
  const blowoutRisk = range(seed >>> 16, 0, 1);
  const decisionEdge = Number((scheduleFatigueEdge * 0.35 + travelEdge * 0.25 + altitudeEdge * 0.25 + restAdvantage * 0.38 + sharpSplitSignal * 0.45 + recentShotQualityEdge * 0.55 + recentRimPressureEdge * 0.28 + defensiveSchemeEdge * 0.42 + matchupSizeEdge * 0.22 + benchDepthEdge * 0.32 + clutchEdge * 0.25 - marketPublicBias * 0.25).toFixed(2));
  const totalContextEdge = Number((refereePaceBias * 1.2 + refereeFoulBias * 0.9 + recentShotQualityEdge * 0.4 + recentRimPressureEdge * 0.35 - garbageTimeRisk * 0.8).toFixed(2));
  const volatilityContext = Number((1 + Math.abs(sharpSplitSignal) / 10 + garbageTimeRisk * 0.12 + blowoutRisk * 0.1).toFixed(2));
  const confidenceAdjustment = Number((sharpSplitSignal * 1.2 - Math.abs(marketPublicBias) * 0.7 - garbageTimeRisk * 2 - blowoutRisk * 1.5).toFixed(2));

  return { awayTeam, homeTeam, source: "synthetic", scheduleFatigueEdge, travelEdge, altitudeEdge, restAdvantage, refereePaceBias, refereeFoulBias, marketPublicBias, sharpSplitSignal, recentShotQualityEdge, recentRimPressureEdge, defensiveSchemeEdge, matchupSizeEdge, benchDepthEdge, clutchEdge, garbageTimeRisk, blowoutRisk, decisionEdge, totalContextEdge, volatilityContext, confidenceAdjustment, notes: ["Decision context is using synthetic fallback values until a real context feed is configured."] };
}

function rowsFromBody(body: any): RawDecisionContext[] {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.games)) return body.games;
  if (Array.isArray(body?.contexts)) return body.contexts;
  if (Array.isArray(body?.data)) return body.data;
  return [];
}

function normalizeRaw(row: RawDecisionContext): NbaDecisionContext | null {
  const awayTeam = row.awayTeam ?? row.away;
  const homeTeam = row.homeTeam ?? row.home;
  if (!awayTeam || !homeTeam) return null;
  const base = syntheticContext(awayTeam, homeTeam);
  return {
    ...base,
    source: "real",
    scheduleFatigueEdge: num(row.scheduleFatigueEdge, base.scheduleFatigueEdge),
    travelEdge: num(row.travelEdge, base.travelEdge),
    altitudeEdge: num(row.altitudeEdge, base.altitudeEdge),
    restAdvantage: num(row.restAdvantage, base.restAdvantage),
    refereePaceBias: num(row.refereePaceBias, base.refereePaceBias),
    refereeFoulBias: num(row.refereeFoulBias, base.refereeFoulBias),
    marketPublicBias: num(row.marketPublicBias, base.marketPublicBias),
    sharpSplitSignal: num(row.sharpSplitSignal, base.sharpSplitSignal),
    recentShotQualityEdge: num(row.recentShotQualityEdge, base.recentShotQualityEdge),
    recentRimPressureEdge: num(row.recentRimPressureEdge, base.recentRimPressureEdge),
    defensiveSchemeEdge: num(row.defensiveSchemeEdge, base.defensiveSchemeEdge),
    matchupSizeEdge: num(row.matchupSizeEdge, base.matchupSizeEdge),
    benchDepthEdge: num(row.benchDepthEdge, base.benchDepthEdge),
    clutchEdge: num(row.clutchEdge, base.clutchEdge),
    garbageTimeRisk: num(row.garbageTimeRisk, base.garbageTimeRisk),
    blowoutRisk: num(row.blowoutRisk, base.blowoutRisk),
    decisionEdge: num(row.decisionEdge, base.decisionEdge),
    totalContextEdge: num(row.totalContextEdge, base.totalContextEdge),
    volatilityContext: num(row.volatilityContext, base.volatilityContext),
    confidenceAdjustment: num(row.confidenceAdjustment, base.confidenceAdjustment),
    notes: Array.isArray(row.notes) ? row.notes : ["Real decision context feed applied."]
  };
}

async function fetchContexts() {
  const cached = await readHotCache<Record<string, NbaDecisionContext>>(CACHE_KEY);
  if (cached) return cached;
  const url = process.env.NBA_DECISION_CONTEXT_URL?.trim();
  if (!url) return null;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const body = await response.json();
    const contexts: Record<string, NbaDecisionContext> = {};
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

export async function getNbaDecisionContext(awayTeam: string, homeTeam: string): Promise<NbaDecisionContext> {
  const contexts = await fetchContexts();
  return contexts?.[keyFor(awayTeam, homeTeam)] ?? syntheticContext(awayTeam, homeTeam);
}

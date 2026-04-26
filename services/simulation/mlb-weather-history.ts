import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import { normalizeMlbTeam } from "@/services/simulation/mlb-team-analytics";

export type MlbWeatherHistoryContext = {
  awayTeam: string;
  homeTeam: string;
  stadium: string | null;
  source: "real" | "synthetic";
  temperatureF: number;
  windMph: number;
  windDirection: "in" | "out" | "cross" | "unknown";
  humidityPct: number;
  precipitationRisk: number;
  roofStatus: "open" | "closed" | "unknown";
  weatherRunFactor: number;
  weatherVolatility: number;
  stadiumRunFactor: number;
  stadiumHrFactor: number;
  awayWeatherSplitEdge: number;
  homeWeatherSplitEdge: number;
  awayVsPitcherEdge: number;
  homeVsPitcherEdge: number;
  awayVsTeamEdge: number;
  homeVsTeamEdge: number;
  awayStadiumHistoryEdge: number;
  homeStadiumHistoryEdge: number;
  sideEdge: number;
  totalEdge: number;
  volatilityAdjustment: number;
  notes: string[];
};

type RawContext = Record<string, unknown>;
const CACHE_KEY = "mlb:weather-history:v1";
const CACHE_TTL_SECONDS = 60 * 30;

function num(value: unknown, fallback: number) { if (typeof value === "number" && Number.isFinite(value)) return value; if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value); return fallback; }
function text(...values: unknown[]) { for (const value of values) if (typeof value === "string" && value.trim()) return value.trim(); return null; }
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function keyFor(awayTeam: string, homeTeam: string) { return `${normalizeMlbTeam(awayTeam)}@${normalizeMlbTeam(homeTeam)}`; }
function rowsFromBody(body: any): RawContext[] { if (Array.isArray(body)) return body; if (Array.isArray(body?.games)) return body.games; if (Array.isArray(body?.data)) return body.data; if (Array.isArray(body?.contexts)) return body.contexts; return []; }
function windDirection(value: unknown): MlbWeatherHistoryContext["windDirection"] { const v = String(value ?? "").toLowerCase(); if (v.includes("out")) return "out"; if (v.includes("in")) return "in"; if (v.includes("cross") || v.includes("left") || v.includes("right")) return "cross"; return "unknown"; }
function roofStatus(value: unknown): MlbWeatherHistoryContext["roofStatus"] { const v = String(value ?? "").toLowerCase(); if (v.includes("open")) return "open"; if (v.includes("closed")) return "closed"; return "unknown"; }
function hashString(value: string) { let hash = 0; for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0; return hash; }
function seedUnit(seed: number) { return (seed % 1000) / 1000; }
function range(seed: number, min: number, max: number) { return Number((min + seedUnit(seed) * (max - min)).toFixed(2)); }

function derive(args: Omit<MlbWeatherHistoryContext, "sideEdge" | "totalEdge" | "volatilityAdjustment" | "notes">) {
  const windFactor = args.windDirection === "out" ? args.windMph * 0.025 : args.windDirection === "in" ? -args.windMph * 0.023 : args.windMph * 0.004;
  const tempFactor = (args.temperatureF - 70) * 0.012;
  const humidityFactor = (args.humidityPct - 50) * 0.003;
  const roofPenalty = args.roofStatus === "closed" ? -Math.abs(windFactor) * 0.8 : 0;
  const weatherRunImpact = windFactor + tempFactor + humidityFactor + roofPenalty + (args.precipitationRisk > 0.35 ? -0.18 : 0);
  const sideEdge = Number(((args.homeWeatherSplitEdge - args.awayWeatherSplitEdge) * 0.3 + (args.homeVsPitcherEdge - args.awayVsPitcherEdge) * 0.45 + (args.homeVsTeamEdge - args.awayVsTeamEdge) * 0.22 + (args.homeStadiumHistoryEdge - args.awayStadiumHistoryEdge) * 0.2).toFixed(2));
  const totalEdge = Number((weatherRunImpact + (args.weatherRunFactor - 1) * 4 + (args.stadiumRunFactor - 1) * 3.5 + (args.stadiumHrFactor - 1) * 1.2 + Math.abs(args.homeVsPitcherEdge) * 0.08 + Math.abs(args.awayVsPitcherEdge) * 0.08).toFixed(2));
  const volatilityAdjustment = Number(clamp(1 + args.weatherVolatility * 0.16 + args.precipitationRisk * 0.18 + Math.abs(weatherRunImpact) * 0.12, 0.82, 1.45).toFixed(2));
  return { sideEdge, totalEdge, volatilityAdjustment, notes: [`Weather total edge ${totalEdge > 0 ? "+" : ""}${totalEdge}.`, `Weather/history side edge ${sideEdge > 0 ? "+" : ""}${sideEdge}.`, `Weather volatility adjustment ${volatilityAdjustment}.`] };
}

function syntheticContext(awayTeam: string, homeTeam: string): MlbWeatherHistoryContext {
  const seed = hashString(`${awayTeam}@${homeTeam}:weather-history`);
  const base = {
    awayTeam,
    homeTeam,
    stadium: null,
    source: "synthetic" as const,
    temperatureF: range(seed >>> 1, 55, 90),
    windMph: range(seed >>> 2, 2, 16),
    windDirection: windDirection(["in", "out", "cross", "unknown"][seed % 4]),
    humidityPct: range(seed >>> 3, 35, 82),
    precipitationRisk: range(seed >>> 4, 0, 0.45),
    roofStatus: roofStatus("unknown"),
    weatherRunFactor: range(seed >>> 5, 0.92, 1.1),
    weatherVolatility: range(seed >>> 6, 0.05, 0.6),
    stadiumRunFactor: range(seed >>> 7, 0.9, 1.14),
    stadiumHrFactor: range(seed >>> 8, 0.88, 1.18),
    awayWeatherSplitEdge: range(seed >>> 9, -1.2, 1.2),
    homeWeatherSplitEdge: range(seed >>> 10, -1.2, 1.2),
    awayVsPitcherEdge: range(seed >>> 11, -1.5, 1.5),
    homeVsPitcherEdge: range(seed >>> 12, -1.5, 1.5),
    awayVsTeamEdge: range(seed >>> 13, -1.1, 1.1),
    homeVsTeamEdge: range(seed >>> 14, -1.1, 1.1),
    awayStadiumHistoryEdge: range(seed >>> 15, -0.8, 0.8),
    homeStadiumHistoryEdge: range(seed >>> 16, -0.8, 0.8)
  };
  return { ...base, ...derive(base) };
}

function normalizeRaw(row: RawContext): MlbWeatherHistoryContext | null {
  const awayTeam = text(row.awayTeam, row.away, row.away_team);
  const homeTeam = text(row.homeTeam, row.home, row.home_team);
  if (!awayTeam || !homeTeam) return null;
  const fallback = syntheticContext(awayTeam, homeTeam);
  const base = {
    awayTeam,
    homeTeam,
    stadium: text(row.stadium, row.venue, row.ballpark),
    source: "real" as const,
    temperatureF: num(row.temperatureF ?? row.tempF ?? row.temperature, fallback.temperatureF),
    windMph: num(row.windMph ?? row.wind_mph, fallback.windMph),
    windDirection: windDirection(row.windDirection ?? row.wind_direction),
    humidityPct: num(row.humidityPct ?? row.humidity, fallback.humidityPct),
    precipitationRisk: num(row.precipitationRisk ?? row.precipProbability ?? row.precipitation, fallback.precipitationRisk),
    roofStatus: roofStatus(row.roofStatus ?? row.roof),
    weatherRunFactor: num(row.weatherRunFactor ?? row.weather_run_factor, fallback.weatherRunFactor),
    weatherVolatility: num(row.weatherVolatility ?? row.weather_volatility, fallback.weatherVolatility),
    stadiumRunFactor: num(row.stadiumRunFactor ?? row.parkRunFactor ?? row.park_factor, fallback.stadiumRunFactor),
    stadiumHrFactor: num(row.stadiumHrFactor ?? row.hrFactor ?? row.hr_factor, fallback.stadiumHrFactor),
    awayWeatherSplitEdge: num(row.awayWeatherSplitEdge ?? row.away_weather_split, fallback.awayWeatherSplitEdge),
    homeWeatherSplitEdge: num(row.homeWeatherSplitEdge ?? row.home_weather_split, fallback.homeWeatherSplitEdge),
    awayVsPitcherEdge: num(row.awayVsPitcherEdge ?? row.away_vs_pitcher, fallback.awayVsPitcherEdge),
    homeVsPitcherEdge: num(row.homeVsPitcherEdge ?? row.home_vs_pitcher, fallback.homeVsPitcherEdge),
    awayVsTeamEdge: num(row.awayVsTeamEdge ?? row.away_vs_team, fallback.awayVsTeamEdge),
    homeVsTeamEdge: num(row.homeVsTeamEdge ?? row.home_vs_team, fallback.homeVsTeamEdge),
    awayStadiumHistoryEdge: num(row.awayStadiumHistoryEdge ?? row.away_stadium_history, fallback.awayStadiumHistoryEdge),
    homeStadiumHistoryEdge: num(row.homeStadiumHistoryEdge ?? row.home_stadium_history, fallback.homeStadiumHistoryEdge)
  };
  return { ...base, ...derive(base) };
}

async function fetchContexts() {
  const cached = await readHotCache<Record<string, MlbWeatherHistoryContext>>(CACHE_KEY);
  if (cached) return cached;
  const url = process.env.MLB_WEATHER_HISTORY_URL?.trim() || process.env.MLB_WEATHER_FEED_URL?.trim();
  if (!url) return null;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const grouped: Record<string, MlbWeatherHistoryContext> = {};
    for (const row of rowsFromBody(await response.json())) {
      const context = normalizeRaw(row);
      if (context) grouped[keyFor(context.awayTeam, context.homeTeam)] = context;
    }
    if (Object.keys(grouped).length) {
      await writeHotCache(CACHE_KEY, grouped, CACHE_TTL_SECONDS);
      return grouped;
    }
  } catch {
    return null;
  }
  return null;
}

export async function getMlbWeatherHistoryContext(awayTeam: string, homeTeam: string): Promise<MlbWeatherHistoryContext> {
  const contexts = await fetchContexts();
  return contexts?.[keyFor(awayTeam, homeTeam)] ?? syntheticContext(awayTeam, homeTeam);
}

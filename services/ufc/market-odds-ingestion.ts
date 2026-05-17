import crypto from "node:crypto";

import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";

type FightRow = {
  fight_id: string;
  event_label: string;
  fight_date: Date | string;
  fighter_a_id: string;
  fighter_b_id: string;
  fighter_a_name: string;
  fighter_b_name: string;
};

export type UfcMarketOddsItem = {
  fighterA: string;
  fighterB: string;
  oddsA: number;
  oddsB: number;
  bookmaker?: string | null;
  marketKey?: string | null;
  source?: string | null;
  eventName?: string | null;
  eventDate?: string | null;
  fetchedAt?: string | null;
  raw?: unknown;
};

export type UfcMarketOddsIngestionResult = {
  ok: boolean;
  mode: "dry-run" | "write";
  source: string;
  inputItems: number;
  candidateFights: number;
  matched: number;
  updated: number;
  unmatchedItems: Array<{ fighterA: string; fighterB: string; oddsA: number; oddsB: number }>;
  matches: Array<{ fightId: string; eventLabel: string; fighterA: string; fighterB: string; oddsA: number; oddsB: number; bookmaker: string | null; score: number }>;
  errors: string[];
};

function stableHash(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/^\+/, ""));
    return Number.isFinite(parsed) ? Math.round(parsed) : null;
  }
  return null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokenSet(value: string) {
  return new Set(normalizeName(value).split(" ").filter(Boolean));
}

function nameScore(left: string, right: string) {
  const a = normalizeName(left);
  const b = normalizeName(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.92;
  const ta = tokenSet(a);
  const tb = tokenSet(b);
  const common = [...ta].filter((token) => tb.has(token)).length;
  return common / Math.max(ta.size, tb.size, 1);
}

function pairScore(item: UfcMarketOddsItem, fight: FightRow) {
  const direct = (nameScore(item.fighterA, fight.fighter_a_name) + nameScore(item.fighterB, fight.fighter_b_name)) / 2;
  const flipped = (nameScore(item.fighterA, fight.fighter_b_name) + nameScore(item.fighterB, fight.fighter_a_name)) / 2;
  return { score: Math.max(direct, flipped), flipped: flipped > direct };
}

function validAmerican(odds: number) {
  return Number.isInteger(odds) && odds !== 0 && Math.abs(odds) >= 100 && Math.abs(odds) <= 5000;
}

function simpleItem(record: Record<string, unknown>, raw: unknown): UfcMarketOddsItem | null {
  const fighterA = text(record.fighterA) ?? text(record.homeTeam) ?? text(record.home_team) ?? text(record.fighter_a) ?? text(record.nameA);
  const fighterB = text(record.fighterB) ?? text(record.awayTeam) ?? text(record.away_team) ?? text(record.fighter_b) ?? text(record.nameB);
  const oddsA = numberValue(record.oddsA ?? record.homeOdds ?? record.home_odds ?? record.odds_a ?? record.priceA);
  const oddsB = numberValue(record.oddsB ?? record.awayOdds ?? record.away_odds ?? record.odds_b ?? record.priceB);
  if (!fighterA || !fighterB || oddsA == null || oddsB == null || !validAmerican(oddsA) || !validAmerican(oddsB)) return null;
  return {
    fighterA,
    fighterB,
    oddsA,
    oddsB,
    bookmaker: text(record.bookmaker) ?? text(record.book) ?? text(record.sportsbook),
    marketKey: text(record.marketKey) ?? text(record.market) ?? "h2h",
    source: text(record.source),
    eventName: text(record.eventName) ?? text(record.event_name),
    eventDate: text(record.eventDate) ?? text(record.commence_time),
    fetchedAt: text(record.fetchedAt),
    raw
  };
}

function extractTheOddsApiItems(event: Record<string, unknown>): UfcMarketOddsItem[] {
  const bookmakers = Array.isArray(event.bookmakers) ? event.bookmakers : [];
  const items: UfcMarketOddsItem[] = [];
  for (const bookmakerValue of bookmakers) {
    const bookmaker = asRecord(bookmakerValue);
    const markets = Array.isArray(bookmaker.markets) ? bookmaker.markets : [];
    for (const marketValue of markets) {
      const market = asRecord(marketValue);
      const key = text(market.key);
      if (key !== "h2h" && key !== "moneyline") continue;
      const outcomes = Array.isArray(market.outcomes) ? market.outcomes.map(asRecord) : [];
      if (outcomes.length !== 2) continue;
      const aName = text(outcomes[0].name);
      const bName = text(outcomes[1].name);
      const aOdds = numberValue(outcomes[0].price);
      const bOdds = numberValue(outcomes[1].price);
      if (!aName || !bName || aOdds == null || bOdds == null || !validAmerican(aOdds) || !validAmerican(bOdds)) continue;
      items.push({
        fighterA: aName,
        fighterB: bName,
        oddsA: aOdds,
        oddsB: bOdds,
        bookmaker: text(bookmaker.title) ?? text(bookmaker.key),
        marketKey: key,
        source: "the-odds-api-compatible",
        eventName: text(event.home_team) && text(event.away_team) ? `${text(event.home_team)} vs ${text(event.away_team)}` : text(event.sport_title),
        eventDate: text(event.commence_time),
        raw: event
      });
    }
  }
  return items;
}

export function extractUfcMarketOddsItems(input: unknown): UfcMarketOddsItem[] {
  const root = asRecord(input);
  const sourceArray = Array.isArray(input) ? input : Array.isArray(root.events) ? root.events : Array.isArray(root.odds) ? root.odds : Array.isArray(root.data) ? root.data : [];
  const items: UfcMarketOddsItem[] = [];
  for (const value of sourceArray) {
    const record = asRecord(value);
    const simple = simpleItem(record, value);
    if (simple) items.push(simple);
    items.push(...extractTheOddsApiItems(record));
  }
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${normalizeName(item.fighterA)}:${normalizeName(item.fighterB)}:${item.oddsA}:${item.oddsB}:${item.bookmaker ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function upcomingFights(horizonDays: number) {
  return prisma.$queryRaw<FightRow[]>`
    SELECT f.id AS fight_id, f.event_label, f.fight_date, f.fighter_a_id, f.fighter_b_id,
      fa.full_name AS fighter_a_name, fb.full_name AS fighter_b_name
    FROM ufc_fights f
    JOIN ufc_fighters fa ON fa.id = f.fighter_a_id
    JOIN ufc_fighters fb ON fb.id = f.fighter_b_id
    WHERE f.fight_date >= now() - interval '12 hours'
      AND f.fight_date <= now() + (${horizonDays}::text || ' days')::interval
      AND f.status NOT IN ('CANCELED', 'VOID')
      AND COALESCE(f.payload_json->>'matchupQuality', '') <> 'FAKE_NAVIGATION'
    ORDER BY f.fight_date ASC;
  `;
}

function marketPayload(item: UfcMarketOddsItem, fight: FightRow, flipped: boolean, score: number, source: string) {
  const oddsA = flipped ? item.oddsB : item.oddsA;
  const oddsB = flipped ? item.oddsA : item.oddsB;
  return {
    marketOdds: {
      source,
      oddsId: stableHash(`${fight.fight_id}:${item.fighterA}:${item.fighterB}:${item.oddsA}:${item.oddsB}:${item.bookmaker ?? ""}`),
      bookmaker: item.bookmaker ?? null,
      marketKey: item.marketKey ?? "h2h",
      fetchedAt: item.fetchedAt ?? new Date().toISOString(),
      matchScore: score,
      fighterAId: fight.fighter_a_id,
      fighterBId: fight.fighter_b_id,
      fighterAName: fight.fighter_a_name,
      fighterBName: fight.fighter_b_name,
      fighterAOddsAmerican: oddsA,
      fighterBOddsAmerican: oddsB,
      open: { fighterAOddsAmerican: oddsA, fighterBOddsAmerican: oddsB },
      close: { fighterAOddsAmerican: oddsA, fighterBOddsAmerican: oddsB },
      rawNames: { fighterA: item.fighterA, fighterB: item.fighterB }
    }
  };
}

export async function ingestUfcMarketOdds(input: unknown, options: { dryRun?: boolean; horizonDays?: number; minMatchScore?: number; source?: string } = {}): Promise<UfcMarketOddsIngestionResult> {
  if (!hasUsableServerDatabaseUrl()) return { ok: false, mode: options.dryRun ? "dry-run" : "write", source: options.source ?? "unknown", inputItems: 0, candidateFights: 0, matched: 0, updated: 0, unmatchedItems: [], matches: [], errors: ["No usable server database URL is configured."] };
  const dryRun = Boolean(options.dryRun);
  const horizonDays = Math.max(1, Math.min(365, Math.floor(options.horizonDays ?? 180)));
  const minMatchScore = Math.max(0.5, Math.min(1, options.minMatchScore ?? 0.86));
  const source = options.source ?? "ufc-market-odds-ingestion";
  const items = extractUfcMarketOddsItems(input);
  const fights = await upcomingFights(horizonDays);
  const matchedFightIds = new Set<string>();
  const matches: UfcMarketOddsIngestionResult["matches"] = [];
  const unmatchedItems: UfcMarketOddsIngestionResult["unmatchedItems"] = [];
  const errors: string[] = [];
  let updated = 0;

  for (const item of items) {
    const scored = fights.filter((fight) => !matchedFightIds.has(fight.fight_id)).map((fight) => ({ fight, ...pairScore(item, fight) })).sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (!best || best.score < minMatchScore) {
      unmatchedItems.push({ fighterA: item.fighterA, fighterB: item.fighterB, oddsA: item.oddsA, oddsB: item.oddsB });
      continue;
    }
    matchedFightIds.add(best.fight.fight_id);
    const payload = marketPayload(item, best.fight, best.flipped, Number(best.score.toFixed(3)), source);
    matches.push({ fightId: best.fight.fight_id, eventLabel: best.fight.event_label, fighterA: best.fight.fighter_a_name, fighterB: best.fight.fighter_b_name, oddsA: payload.marketOdds.fighterAOddsAmerican, oddsB: payload.marketOdds.fighterBOddsAmerican, bookmaker: item.bookmaker ?? null, score: payload.marketOdds.matchScore });
    if (!dryRun) {
      try {
        await prisma.$executeRaw`
          UPDATE ufc_fights
          SET payload_json = COALESCE(payload_json, '{}'::jsonb) || ${JSON.stringify(payload)}::jsonb,
              updated_at = now()
          WHERE id = ${best.fight.fight_id};
        `;
        updated += 1;
      } catch (error) {
        errors.push(`${best.fight.event_label}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  return { ok: errors.length === 0, mode: dryRun ? "dry-run" : "write", source, inputItems: items.length, candidateFights: fights.length, matched: matches.length, updated, unmatchedItems: unmatchedItems.slice(0, 50), matches: matches.slice(0, 100), errors: errors.slice(0, 50) };
}

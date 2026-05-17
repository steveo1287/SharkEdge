import { prisma } from "@/lib/db/prisma";

export type UfcMoneylineOutcome = { name?: string; price?: number | null };
export type UfcMoneylineMarket = { key?: string; outcomes?: UfcMoneylineOutcome[] };
export type UfcMoneylineBookmaker = { key?: string; title?: string; last_update?: string; markets?: UfcMoneylineMarket[] };
export type UfcMoneylineEvent = {
  id?: string;
  sport_key?: string;
  sport_title?: string;
  commence_time?: string;
  home_team?: string | null;
  away_team?: string | null;
  bookmakers?: UfcMoneylineBookmaker[];
};

export type UfcMarketOddsSyncResult = {
  attemptedEvents: number;
  matchedEvents: number;
  updatedFights: number;
  skippedEvents: number;
  warnings: string[];
};

type FightCandidate = {
  id: string;
  fight_date: Date | string;
  fighter_a_id: string;
  fighter_b_id: string;
  fighter_a_name: string | null;
  fighter_b_name: string | null;
};

type BookLine = {
  book: string;
  bookKey: string | null;
  fetchedAt: string;
  fighterAOddsAmerican: number;
  fighterBOddsAmerican: number;
};

function normalizeName(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\b(jr|sr|iii|ii|iv)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sameFighters(eventA: string, eventB: string, fightA: string | null, fightB: string | null) {
  const ea = normalizeName(eventA);
  const eb = normalizeName(eventB);
  const fa = normalizeName(fightA);
  const fb = normalizeName(fightB);
  if (!ea || !eb || !fa || !fb) return false;
  return (ea === fa && eb === fb) || (ea === fb && eb === fa);
}

function eventTime(value: string | null | undefined) {
  const time = new Date(value ?? "").getTime();
  return Number.isFinite(time) ? time : null;
}

function parsePrice(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/^\+/, ""));
    return Number.isFinite(parsed) ? Math.round(parsed) : null;
  }
  return null;
}

function moneylineMarket(bookmaker: UfcMoneylineBookmaker) {
  return (bookmaker.markets ?? []).find((market) => market.key === "h2h" || market.key === "moneyline");
}

function outcomePrice(market: UfcMoneylineMarket | undefined, fighterName: string) {
  const wanted = normalizeName(fighterName);
  const outcome = (market?.outcomes ?? []).find((item) => normalizeName(item.name) === wanted);
  return parsePrice(outcome?.price);
}

function extractBookLines(event: UfcMoneylineEvent, fight: FightCandidate, generatedAt: string): BookLine[] {
  const lines: BookLine[] = [];
  const fighterAName = fight.fighter_a_name ?? "";
  const fighterBName = fight.fighter_b_name ?? "";
  for (const bookmaker of event.bookmakers ?? []) {
    const market = moneylineMarket(bookmaker);
    const fighterAOddsAmerican = outcomePrice(market, fighterAName);
    const fighterBOddsAmerican = outcomePrice(market, fighterBName);
    if (fighterAOddsAmerican == null || fighterBOddsAmerican == null) continue;
    lines.push({
      book: bookmaker.title || bookmaker.key || "Unknown Book",
      bookKey: bookmaker.key ?? null,
      fetchedAt: bookmaker.last_update || generatedAt,
      fighterAOddsAmerican,
      fighterBOddsAmerican
    });
  }
  return lines;
}

function avg(values: number[]) {
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function bestLine(lines: BookLine[], side: "A" | "B") {
  if (!lines.length) return null;
  return [...lines].sort((left, right) => {
    const l = side === "A" ? left.fighterAOddsAmerican : left.fighterBOddsAmerican;
    const r = side === "A" ? right.fighterAOddsAmerican : right.fighterBOddsAmerican;
    return r - l;
  })[0];
}

function marketOddsPayload(event: UfcMoneylineEvent, fight: FightCandidate, lines: BookLine[], generatedAt: string) {
  const bestA = bestLine(lines, "A");
  const bestB = bestLine(lines, "B");
  const consensusA = avg(lines.map((line) => line.fighterAOddsAmerican));
  const consensusB = avg(lines.map((line) => line.fighterBOddsAmerican));
  const representative = lines[0];
  const fighterAOddsAmerican = consensusA ?? representative?.fighterAOddsAmerican ?? null;
  const fighterBOddsAmerican = consensusB ?? representative?.fighterBOddsAmerican ?? null;
  return {
    provider: "the-odds-api",
    source: "theoddsapi",
    sportKey: event.sport_key ?? null,
    sportTitle: event.sport_title ?? null,
    eventKey: event.id ?? null,
    fetchedAt: generatedAt,
    matchedAt: new Date().toISOString(),
    matchType: "fighter_names_date_window",
    fighterAId: fight.fighter_a_id,
    fighterBId: fight.fighter_b_id,
    fighterAName: fight.fighter_a_name,
    fighterBName: fight.fighter_b_name,
    book: representative?.book ?? null,
    bookCount: lines.length,
    open: {
      fighterAOddsAmerican,
      fighterBOddsAmerican,
      book: representative?.book ?? null,
      fetchedAt: representative?.fetchedAt ?? generatedAt
    },
    close: {
      fighterAOddsAmerican,
      fighterBOddsAmerican,
      book: representative?.book ?? null,
      fetchedAt: representative?.fetchedAt ?? generatedAt
    },
    current: {
      fighterAOddsAmerican,
      fighterBOddsAmerican,
      book: representative?.book ?? null,
      fetchedAt: representative?.fetchedAt ?? generatedAt
    },
    consensus: {
      fighterAOddsAmerican: consensusA,
      fighterBOddsAmerican: consensusB
    },
    best: {
      fighterA: bestA ? { book: bestA.book, oddsAmerican: bestA.fighterAOddsAmerican, fetchedAt: bestA.fetchedAt } : null,
      fighterB: bestB ? { book: bestB.book, oddsAmerican: bestB.fighterBOddsAmerican, fetchedAt: bestB.fetchedAt } : null
    },
    books: lines
  };
}

async function findFightForEvent(event: UfcMoneylineEvent) {
  const away = event.away_team ?? "";
  const home = event.home_team ?? "";
  const time = eventTime(event.commence_time);
  if (!away || !home || time == null) return null;
  const eventIso = new Date(time).toISOString();
  const rows = await prisma.$queryRaw<FightCandidate[]>`
    SELECT f.id, f.fight_date, f.fighter_a_id, f.fighter_b_id, fa.full_name AS fighter_a_name, fb.full_name AS fighter_b_name
    FROM ufc_fights f
    JOIN ufc_fighters fa ON fa.id = f.fighter_a_id
    JOIN ufc_fighters fb ON fb.id = f.fighter_b_id
    WHERE f.fight_date >= ${eventIso}::timestamptz - interval '5 days'
      AND f.fight_date <= ${eventIso}::timestamptz + interval '5 days'
      AND COALESCE(f.status, 'SCHEDULED') <> 'COMPLETED'
    ORDER BY abs(extract(epoch from (f.fight_date - ${eventIso}::timestamptz))) ASC
    LIMIT 80
  `;
  return rows.find((fight) => sameFighters(away, home, fight.fighter_a_name, fight.fighter_b_name)) ?? null;
}

export async function syncUfcMarketOddsFromEvents(events: UfcMoneylineEvent[], generatedAt = new Date().toISOString()): Promise<UfcMarketOddsSyncResult> {
  const result: UfcMarketOddsSyncResult = { attemptedEvents: 0, matchedEvents: 0, updatedFights: 0, skippedEvents: 0, warnings: [] };
  for (const event of events) {
    result.attemptedEvents += 1;
    const fight = await findFightForEvent(event);
    if (!fight) {
      result.skippedEvents += 1;
      result.warnings.push(`${event.id ?? "unknown"}: no UFC fight match for ${event.away_team ?? "?"} vs ${event.home_team ?? "?"}`);
      continue;
    }
    result.matchedEvents += 1;
    const lines = extractBookLines(event, fight, generatedAt);
    if (!lines.length) {
      result.skippedEvents += 1;
      result.warnings.push(`${event.id ?? fight.id}: matched ${fight.fighter_a_name} vs ${fight.fighter_b_name}, but no paired h2h moneyline was found.`);
      continue;
    }
    const payload = marketOddsPayload(event, fight, lines, generatedAt);
    await prisma.$executeRaw`
      UPDATE ufc_fights
      SET payload_json = COALESCE(payload_json, '{}'::jsonb) || jsonb_build_object('marketOdds', ${JSON.stringify(payload)}::jsonb),
          updated_at = now()
      WHERE id = ${fight.id}
    `;
    result.updatedFights += 1;
  }
  return result;
}

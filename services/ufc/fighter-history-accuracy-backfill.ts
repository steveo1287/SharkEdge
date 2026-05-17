import crypto from "node:crypto";

import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import { persistUfcStatsFightStatsFromDetail } from "@/services/ufc/fight-stat-extractor";
import { parseUfcStatsFightDetail } from "@/services/ufc/ufcstats-parser";

type FighterRow = { id: string; full_name: string; payload_json: unknown };
type ParsedHistoryFight = { url: string; eventName: string | null; eventDate: string | null; result: string | null; opponentName: string | null; method: string | null; round: number | null; time: string | null };
type InternalFight = { id: string; fighter_a_id: string; fighter_b_id: string; fighter_a_name: string; fighter_b_name: string };
type BackfillItem = { fighterId: string; fighterName: string; ufcStatsUrl: string | null; parsedFights: number; processedFights: number; statRowsWritten: number; warnings: string[] };

const USER_AGENT = "SharkEdge-UFCStats-HistoryAccuracyBackfill/1.0";

function stableId(prefix: string, value: string) { return `${prefix}_${crypto.createHash("sha256").update(value).digest("hex").slice(0, 24)}`; }
function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function strip(html: string) { return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#039;/g, "'").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim(); }
function normalizeName(value: string | null | undefined) { return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function payloadRecords(payload: unknown) { const root = asRecord(payload); const elite = asRecord(root.eliteProfile); const complete = asRecord(root.completeProfile); return [root, asRecord(root.stats), asRecord(root.profile), asRecord(root.rawPayload), asRecord(root.rawFeature), elite, asRecord(elite.rawPayload), complete, asRecord(complete.rawPayload)]; }
function pickString(payload: unknown, ...keys: string[]) { for (const record of payloadRecords(payload)) for (const key of keys) { const value = record[key]; if (typeof value === "string" && value.trim()) return value.trim(); } return null; }
function fighterUrl(payload: unknown) { const url = pickString(payload, "ufcStatsUrl", "ufcstatsUrl", "url", "profileUrl", "fighterUrl"); return url && /ufcstats\.com\/fighter-details/i.test(url) ? url : null; }
function cells(rowHtml: string) { return [...rowHtml.matchAll(/<t[dh][\s\S]*?<\/t[dh]>/gi)].map((match) => match[0]); }
function firstHref(rowHtml: string) { return rowHtml.match(/href=["']([^"']*fight-details[^"']+)["']/i)?.[1] ?? null; }
function parseNumber(value: string | null | undefined) { const parsed = Number(String(value ?? "").match(/\d+/)?.[0] ?? NaN); return Number.isFinite(parsed) ? parsed : null; }
function parseDate(value: string | null | undefined) { const text = String(value ?? "").trim(); if (!text) return null; const parsed = new Date(text); return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString(); }

function parseHistoryRows(html: string): ParsedHistoryFight[] {
  const rows = [...html.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((match) => match[0]);
  const fights: ParsedHistoryFight[] = [];
  for (const row of rows) {
    const url = firstHref(row);
    if (!url) continue;
    const c = cells(row).map(strip).filter(Boolean);
    const text = strip(row);
    const result = /\bwin\b/i.test(text) ? "win" : /\bloss?\b|\blost\b/i.test(text) ? "loss" : null;
    const eventName = c.find((value) => /UFC|DWCS|TUF|Contender|Fight Night/i.test(value)) ?? null;
    const eventDate = parseDate(c.find((value) => /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\b/i.test(value)) ?? null);
    const round = parseNumber(c.find((value) => /^\d+$/.test(value) && Number(value) <= 5) ?? null);
    const time = c.find((value) => /\d{1,2}:\d{2}/.test(value)) ?? null;
    const method = c.find((value) => /KO|TKO|SUB|DEC|Decision|Submission|DQ/i.test(value)) ?? null;
    const linkedNames = [...row.matchAll(/fighter-details[^>]*>([\s\S]*?)<\/a>/gi)].map((match) => strip(match[1])).filter(Boolean);
    const opponentName = linkedNames[1] ?? linkedNames[0] ?? null;
    fights.push({ url, eventName, eventDate, result, opponentName, method, round, time });
  }
  const unique = new Map<string, ParsedHistoryFight>();
  for (const fight of fights) unique.set(fight.url, fight);
  return [...unique.values()];
}

async function fetchHtml(url: string, fetchImpl: typeof fetch) { const response = await fetchImpl(url, { headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" }, cache: "no-store" }); if (!response.ok) throw new Error(`${url} returned ${response.status}`); return response.text(); }

async function loadFighters(options: { limit: number; horizonDays: number; upcomingOnly: boolean }) {
  if (!options.upcomingOnly) return prisma.$queryRaw<FighterRow[]>`SELECT id, full_name, payload_json FROM ufc_fighters ORDER BY updated_at DESC, full_name LIMIT ${options.limit}`;
  return prisma.$queryRaw<FighterRow[]>`
    SELECT DISTINCT ftr.id, ftr.full_name, ftr.payload_json
    FROM ufc_fighters ftr
    JOIN ufc_fights f ON f.fighter_a_id = ftr.id OR f.fighter_b_id = ftr.id
    WHERE f.fight_date >= now() - interval '12 hours'
      AND f.fight_date <= now() + (${options.horizonDays}::text || ' days')::interval
      AND f.status NOT IN ('CANCELED', 'VOID')
      AND COALESCE(f.payload_json->>'matchupQuality', '') <> 'FAKE_NAVIGATION'
    ORDER BY ftr.full_name
    LIMIT ${options.limit}
  `;
}

async function findOrCreateFighter(name: string, url: string | null, dryRun: boolean) {
  const rows = await prisma.$queryRaw<Array<{ id: string; full_name: string }>>`SELECT id, full_name FROM ufc_fighters WHERE regexp_replace(lower(full_name), '[^a-z0-9]+', '', 'g') = regexp_replace(lower(${name}), '[^a-z0-9]+', '', 'g') LIMIT 1`;
  if (rows[0]) return rows[0];
  const id = stableId("ufcf", name);
  if (!dryRun) await prisma.$executeRaw`INSERT INTO ufc_fighters (id, external_key, full_name, payload_json, updated_at) VALUES (${id}, ${url ?? null}, ${name}, ${JSON.stringify({ source: "ufcstats-history-backfill", ufcStatsUrl: url })}::jsonb, now()) ON CONFLICT (id) DO NOTHING`;
  return { id, full_name: name };
}

async function upsertHistoricalFight(args: { detailUrl: string; detail: ReturnType<typeof parseUfcStatsFightDetail>; history: ParsedHistoryFight; anchorFighter: FighterRow; dryRun: boolean }): Promise<InternalFight | null> {
  const a = await findOrCreateFighter(args.detail.fighterAName, args.detail.fighterAUrl ?? null, args.dryRun);
  const b = await findOrCreateFighter(args.detail.fighterBName, args.detail.fighterBUrl ?? null, args.dryRun);
  if (!a || !b || a.id === b.id) return null;
  const fightId = stableId("ufcfi", args.detail.sourceFightId || args.detailUrl);
  const winnerName = args.detail.winnerName ?? (args.history.result === "win" ? args.anchorFighter.full_name : null);
  const winnerId = winnerName && normalizeName(winnerName) === normalizeName(a.full_name) ? a.id : winnerName && normalizeName(winnerName) === normalizeName(b.full_name) ? b.id : null;
  const fightDate = args.history.eventDate ?? new Date("2000-01-01T00:00:00.000Z").toISOString();
  const eventLabel = args.history.eventName ?? `${args.detail.fighterAName} vs ${args.detail.fighterBName}`;
  const payload = { source: "ufcstats-history-backfill", ufcStatsFightUrl: args.detailUrl, sourceFightId: args.detail.sourceFightId, method: args.detail.method ?? args.history.method, round: args.detail.round ?? args.history.round, time: args.detail.time ?? args.history.time, historicalBackfill: true, eventDateKnown: Boolean(args.history.eventDate) };
  if (!args.dryRun) {
    await prisma.$executeRaw`
      INSERT INTO ufc_fights (id, external_fight_id, event_label, fight_date, weight_class, scheduled_rounds, fighter_a_id, fighter_b_id, winner_fighter_id, status, payload_json, updated_at)
      VALUES (${fightId}, ${args.detail.sourceFightId}, ${eventLabel}, ${fightDate}::timestamptz, ${args.detail.weightClass ?? null}, ${args.detail.scheduledRounds ?? 3}, ${a.id}, ${b.id}, ${winnerId}, 'COMPLETED', ${JSON.stringify(payload)}::jsonb, now())
      ON CONFLICT (id) DO UPDATE SET event_label = EXCLUDED.event_label, weight_class = COALESCE(EXCLUDED.weight_class, ufc_fights.weight_class), winner_fighter_id = COALESCE(EXCLUDED.winner_fighter_id, ufc_fights.winner_fighter_id), status = 'COMPLETED', payload_json = COALESCE(ufc_fights.payload_json, '{}'::jsonb) || EXCLUDED.payload_json, updated_at = now()
    `;
  }
  return { id: fightId, fighter_a_id: a.id, fighter_b_id: b.id, fighter_a_name: a.full_name, fighter_b_name: b.full_name };
}

async function updateFighterAccuracyPayload(fighter: FighterRow, item: BackfillItem, dryRun: boolean) {
  if (dryRun) return;
  await prisma.$executeRaw`
    UPDATE ufc_fighters
    SET payload_json = COALESCE(payload_json, '{}'::jsonb) || ${JSON.stringify({ historyAccuracyBackfill: { source: "ufcstats-fighter-history", ufcStatsUrl: item.ufcStatsUrl, parsedFights: item.parsedFights, processedFights: item.processedFights, statRowsWritten: item.statRowsWritten, updatedAt: new Date().toISOString(), warnings: item.warnings.slice(0, 12) } })}::jsonb,
      updated_at = now()
    WHERE id = ${fighter.id}
  `;
}

export async function backfillUfcFighterHistoryAccuracy(options: { limit?: number; horizonDays?: number; upcomingOnly?: boolean; maxFightsPerFighter?: number; dryRun?: boolean; fetchImpl?: typeof fetch } = {}) {
  if (!hasUsableServerDatabaseUrl()) return { ok: false, mode: options.dryRun ? "dry-run" : "write", error: "No usable server database URL is configured." };
  const limit = Math.max(1, Math.min(200, Math.floor(options.limit ?? 40)));
  const horizonDays = Math.max(1, Math.min(365, Math.floor(options.horizonDays ?? 180)));
  const upcomingOnly = options.upcomingOnly ?? true;
  const maxFightsPerFighter = Math.max(1, Math.min(50, Math.floor(options.maxFightsPerFighter ?? 12)));
  const dryRun = Boolean(options.dryRun);
  const fetchImpl = options.fetchImpl ?? fetch;
  const fighters = await loadFighters({ limit, horizonDays, upcomingOnly });
  const items: BackfillItem[] = [];
  const errors: string[] = [];

  for (const fighter of fighters) {
    const url = fighterUrl(fighter.payload_json);
    const item: BackfillItem = { fighterId: fighter.id, fighterName: fighter.full_name, ufcStatsUrl: url, parsedFights: 0, processedFights: 0, statRowsWritten: 0, warnings: [] };
    items.push(item);
    if (!url) { item.warnings.push("Missing UFCStats fighter URL. Run UFCStats known-fighter backfill first."); continue; }
    try {
      const page = await fetchHtml(url, fetchImpl);
      const fights = parseHistoryRows(page).slice(0, maxFightsPerFighter);
      item.parsedFights = fights.length;
      for (const history of fights) {
        try {
          const detailHtml = await fetchHtml(history.url, fetchImpl);
          const detail = parseUfcStatsFightDetail(detailHtml, history.url);
          const internalFight = await upsertHistoricalFight({ detailUrl: history.url, detail, history, anchorFighter: fighter, dryRun });
          if (!internalFight) { item.warnings.push(`Could not build internal fight for ${history.url}`); continue; }
          if (!dryRun) {
            const persisted = await persistUfcStatsFightStatsFromDetail({ detail, fight: internalFight });
            item.statRowsWritten += persisted.rowsWritten;
            if (!persisted.ok) item.warnings.push(...persisted.warnings.map((warning) => `${history.url}: ${warning}`));
          }
          item.processedFights += 1;
        } catch (error) { item.warnings.push(`${history.url}: ${error instanceof Error ? error.message : String(error)}`); }
      }
      await updateFighterAccuracyPayload(fighter, item, dryRun);
    } catch (error) { errors.push(`${fighter.full_name}: ${error instanceof Error ? error.message : String(error)}`); }
  }

  return { ok: errors.length === 0, mode: dryRun ? "dry-run" : "write", fighterCount: fighters.length, fightersWithUfcStatsUrl: items.filter((item) => item.ufcStatsUrl).length, parsedFights: items.reduce((sum, item) => sum + item.parsedFights, 0), processedFights: items.reduce((sum, item) => sum + item.processedFights, 0), statRowsWritten: items.reduce((sum, item) => sum + item.statRowsWritten, 0), items: items.slice(0, 50), errors: errors.slice(0, 50) };
}

import crypto from "node:crypto";

import { prisma } from "@/lib/db/prisma";
import type { UfcStatsFightDetail } from "@/services/ufc/ufcstats-parser";

type InternalFight = {
  id: string;
  fighter_a_id: string;
  fighter_b_id: string;
  fighter_a_name: string;
  fighter_b_name: string;
};

export type PersistedUfcFightStatRow = {
  fighterId: string;
  opponentFighterId: string;
  fighterName: string;
  roundNumber: number;
  secondsFought: number | null;
  sigStrikesLanded: number;
  sigStrikesAttempted: number;
  sigStrikesAbsorbed: number;
  takedownsLanded: number;
  takedownsAttempted: number;
  submissionAttempts: number;
  controlSeconds: number;
  payload: Record<string, unknown>;
};

export type UfcFightStatPersistenceResult = {
  ok: boolean;
  fightId: string;
  sourceUrl: string;
  rowsParsed: number;
  rowsWritten: number;
  warnings: string[];
};

const USER_AGENT = "SharkEdge-UFCStats-FightStatExtractor/1.0";

function stableId(prefix: string, value: string) {
  return `${prefix}_${crypto.createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

function strip(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeName(value: string | null | undefined) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function cells(rowHtml: string) {
  return [...rowHtml.matchAll(/<t[dh][\s\S]*?<\/t[dh]>/gi)].map((match) => match[0]);
}

function cellText(cellHtml: string) {
  return strip(cellHtml);
}

function cellPair(cellHtml: string) {
  const parts = [...cellHtml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => strip(match[1]))
    .filter(Boolean);
  if (parts.length >= 2) return [parts[0], parts[1]] as const;
  const text = cellText(cellHtml);
  const split = text.split(/\s{2,}|\|/).map((item) => item.trim()).filter(Boolean);
  return [split[0] ?? text, split[1] ?? split[0] ?? text] as const;
}

function parseNumber(value: string | null | undefined) {
  const parsed = Number(String(value ?? "").match(/-?\d+(\.\d+)?/)?.[0] ?? NaN);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseOf(value: string | null | undefined) {
  const match = String(value ?? "").match(/(\d+)\s*(?:of|\/|-)\s*(\d+)/i);
  if (match) return { landed: Number(match[1]), attempted: Number(match[2]) };
  const single = parseNumber(value);
  return { landed: single, attempted: single };
}

function parseClock(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  const match = text.match(/(\d{1,2}):(\d{2})/);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

function elapsedSeconds(detail: UfcStatsFightDetail, roundNumber: number, rowCount: number) {
  const finishRound = typeof detail.round === "number" && Number.isFinite(detail.round) ? detail.round : null;
  const finishClock = parseClock(detail.time);
  if (rowCount <= 1 && finishRound) return Math.max(1, (finishRound - 1) * 300 + (finishClock || 300));
  if (finishRound && roundNumber === finishRound) return Math.max(1, finishClock || 300);
  return 300;
}

function roundNumberFromRow(rowHtml: string, index: number) {
  const text = cellText(rowHtml);
  const match = text.match(/\bR(?:ound)?\s*(\d)\b/i) ?? text.match(/\bROUND\s*(\d)\b/i);
  const parsed = match ? Number(match[1]) : index + 1;
  return Math.max(1, Math.min(5, parsed));
}

function findTotalsTable(html: string) {
  const tables = [...html.matchAll(/<table[\s\S]*?<\/table>/gi)].map((match) => match[0]);
  return tables.find((table) => {
    const text = strip(table).toUpperCase();
    return text.includes("KD") && text.includes("SIG. STR") && text.includes("TOTAL STR") && text.includes("SUB. ATT") && text.includes("CTRL");
  }) ?? null;
}

function rowHtmls(tableHtml: string) {
  return [...tableHtml.matchAll(/<tr[\s\S]*?<\/tr>/gi)]
    .map((match) => match[0])
    .filter((row) => /fighter-details|b-fight-details__table-text|<td/i.test(row) && cells(row).length >= 8);
}

function fighterIdForName(fight: InternalFight, name: string) {
  const normalized = normalizeName(name);
  if (normalized === normalizeName(fight.fighter_a_name)) return { fighterId: fight.fighter_a_id, opponentFighterId: fight.fighter_b_id };
  if (normalized === normalizeName(fight.fighter_b_name)) return { fighterId: fight.fighter_b_id, opponentFighterId: fight.fighter_a_id };
  return null;
}

function parseRows(html: string, detail: UfcStatsFightDetail, fight: InternalFight) {
  const table = findTotalsTable(html);
  if (!table) return { rows: [] as PersistedUfcFightStatRow[], warnings: ["UFCStats totals table not found."] };
  const rows = rowHtmls(table);
  const warnings: string[] = [];
  const parsed: PersistedUfcFightStatRow[] = [];
  const rowCount = Math.max(1, rows.length);

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const c = cells(row);
    if (c.length < 10) continue;
    const names = cellPair(c[0]);
    const roundNumber = roundNumberFromRow(row, rowIndex);
    const kd = cellPair(c[1]);
    const sig = cellPair(c[2]);
    const total = cellPair(c[4]);
    const td = cellPair(c[5]);
    const sub = cellPair(c[7]);
    const ctrl = cellPair(c[9]);
    const sigA = parseOf(sig[0]);
    const sigB = parseOf(sig[1]);
    const tdA = parseOf(td[0]);
    const tdB = parseOf(td[1]);
    const totalA = parseOf(total[0]);
    const totalB = parseOf(total[1]);
    const seconds = elapsedSeconds(detail, roundNumber, rowCount);
    const ordered = [
      { name: names[0], sig: sigA, sigAbsorbed: sigB.landed, td: tdA, sub: parseNumber(sub[0]), ctrl: parseClock(ctrl[0]), kd: parseNumber(kd[0]), total: totalA },
      { name: names[1], sig: sigB, sigAbsorbed: sigA.landed, td: tdB, sub: parseNumber(sub[1]), ctrl: parseClock(ctrl[1]), kd: parseNumber(kd[1]), total: totalB }
    ];

    for (const item of ordered) {
      const ids = fighterIdForName(fight, item.name);
      if (!ids) {
        warnings.push(`Could not match UFCStats stat row fighter '${item.name}' to internal fight ${fight.id}.`);
        continue;
      }
      parsed.push({
        fighterId: ids.fighterId,
        opponentFighterId: ids.opponentFighterId,
        fighterName: item.name,
        roundNumber,
        secondsFought: seconds,
        sigStrikesLanded: item.sig.landed,
        sigStrikesAttempted: item.sig.attempted,
        sigStrikesAbsorbed: item.sigAbsorbed,
        takedownsLanded: item.td.landed,
        takedownsAttempted: item.td.attempted,
        submissionAttempts: item.sub,
        controlSeconds: item.ctrl,
        payload: {
          source: "ufcstats-fight-detail",
          sourceUrl: detail.url,
          aggregationType: rowCount <= 1 ? "fight_total" : "round_or_total_row",
          knockdowns: item.kd,
          totalStrikesLanded: item.total.landed,
          totalStrikesAttempted: item.total.attempted,
          rawRoundIndex: rowIndex
        }
      });
    }
  }

  return { rows: parsed, warnings };
}

async function fetchHtml(url: string) {
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!response.ok) throw new Error(`UFCStats fight stat fetch failed ${response.status} for ${url}`);
  return response.text();
}

async function writeStatRow(fightId: string, row: PersistedUfcFightStatRow) {
  const id = stableId("ufcfsr", `${fightId}:${row.fighterId}:${row.roundNumber}`);
  await prisma.$executeRaw`
    INSERT INTO ufc_fight_stats_rounds (id, fight_id, fighter_id, opponent_fighter_id, round_number, seconds_fought, sig_strikes_landed, sig_strikes_attempted, sig_strikes_absorbed, takedowns_landed, takedowns_attempted, submission_attempts, control_seconds, payload_json, updated_at)
    VALUES (${id}, ${fightId}, ${row.fighterId}, ${row.opponentFighterId}, ${row.roundNumber}, ${row.secondsFought}, ${row.sigStrikesLanded}, ${row.sigStrikesAttempted}, ${row.sigStrikesAbsorbed}, ${row.takedownsLanded}, ${row.takedownsAttempted}, ${row.submissionAttempts}, ${row.controlSeconds}, ${JSON.stringify(row.payload)}::jsonb, now())
    ON CONFLICT (fight_id, fighter_id, round_number)
    DO UPDATE SET opponent_fighter_id = EXCLUDED.opponent_fighter_id,
      seconds_fought = EXCLUDED.seconds_fought,
      sig_strikes_landed = EXCLUDED.sig_strikes_landed,
      sig_strikes_attempted = EXCLUDED.sig_strikes_attempted,
      sig_strikes_absorbed = EXCLUDED.sig_strikes_absorbed,
      takedowns_landed = EXCLUDED.takedowns_landed,
      takedowns_attempted = EXCLUDED.takedowns_attempted,
      submission_attempts = EXCLUDED.submission_attempts,
      control_seconds = EXCLUDED.control_seconds,
      payload_json = COALESCE(ufc_fight_stats_rounds.payload_json, '{}'::jsonb) || EXCLUDED.payload_json,
      updated_at = now()
  `;
}

export async function persistUfcStatsFightStatsFromDetail(args: { detail: UfcStatsFightDetail; fight: InternalFight }): Promise<UfcFightStatPersistenceResult> {
  const warnings: string[] = [];
  try {
    const html = await fetchHtml(args.detail.url);
    const parsed = parseRows(html, args.detail, args.fight);
    warnings.push(...parsed.warnings);
    let rowsWritten = 0;
    for (const row of parsed.rows) {
      await writeStatRow(args.fight.id, row);
      rowsWritten += 1;
    }
    return { ok: warnings.length === 0, fightId: args.fight.id, sourceUrl: args.detail.url, rowsParsed: parsed.rows.length, rowsWritten, warnings };
  } catch (error) {
    return { ok: false, fightId: args.fight.id, sourceUrl: args.detail.url, rowsParsed: 0, rowsWritten: 0, warnings: [error instanceof Error ? error.message : String(error)] };
  }
}

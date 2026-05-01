import { Prisma } from "@prisma/client";

import { getServerDatabaseResolution, hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";

const db = prisma as any;
type Outcome = "WIN" | "LOSS" | "PUSH" | "VOID" | "OPEN";

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
function n(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}
function s(value: unknown) { return String(value ?? "").trim().toLowerCase(); }
function meta(row: any): Record<string, any> { return row?.metadataJson && typeof row.metadataJson === "object" ? row.metadataJson : {}; }
function profit(result: Outcome, odds?: number | null) {
  const price = odds ?? -110;
  if (result === "WIN") return Number((price > 0 ? price / 100 : 100 / Math.abs(price)).toFixed(2));
  if (result === "LOSS") return -1;
  return 0;
}
function impliedFromAmerican(odds: number | null | undefined) {
  if (typeof odds !== "number" || !Number.isFinite(odds) || odds === 0 || Math.abs(odds) < 100) return null;
  return odds < 0 ? Math.abs(odds) / (Math.abs(odds) + 100) : 100 / (odds + 100);
}
function clvPct(openOdds: number | null, closeOdds: number | null) {
  const open = impliedFromAmerican(openOdds);
  const close = impliedFromAmerican(closeOdds);
  if (open == null || close == null) return null;
  return Number(((close - open) * 100).toFixed(2));
}
function clvStatus(openOdds: number | null, closeOdds: number | null) {
  const clv = clvPct(openOdds, closeOdds);
  if (clv == null) return "missing-closing-price";
  if (clv > 0.25) return "beat-close";
  if (clv < -0.25) return "lost-to-close";
  return "near-close";
}
function participantLabel(participant: any) {
  return s([participant?.role, participant?.competitor?.name, participant?.competitor?.shortName, participant?.competitor?.abbreviation].filter(Boolean).join(" "));
}
function selectedId(event: any, selected: unknown) {
  const pick = s(selected);
  if (!pick) return null;
  const role = event?.participants?.find((participant: any) => s(participant.role) === pick);
  if (role?.competitorId) return role.competitorId;
  const named = event?.participants?.find((participant: any) => participantLabel(participant).includes(pick) || pick.includes(participantLabel(participant)));
  return named?.competitorId ?? null;
}
function isLedgerResult(value: unknown) {
  const result = String(value ?? "").toUpperCase();
  return result === "WIN" || result === "LOSS" || result === "PUSH" || result === "VOID";
}
function grade(row: any): { result: Outcome; reason: string } {
  const m = meta(row);
  const resultState = s(row?.event?.resultState);
  if (resultState.includes("void") || resultState.includes("no_contest") || resultState.includes("canceled")) return { result: "VOID", reason: `Event result state ${row?.event?.resultState}` };
  if (!row?.event?.eventResult) return { result: "OPEN", reason: "EventResult missing" };
  const side = s(m.side);
  const market = s(m.market ?? row?.trendDefinition?.betType);
  if (market.includes("total") || side.includes("over") || side.includes("under")) {
    const total = n(row.event.eventResult.totalPoints);
    const line = n(m.line) ?? n(m.total) ?? n(m.marketLine);
    if (total == null || line == null) return { result: "OPEN", reason: "Total result or line missing" };
    if (total === line) return { result: "PUSH", reason: `Total pushed at ${line}` };
    if (side.includes("over")) return total > line ? { result: "WIN", reason: `${total} over ${line}` } : { result: "LOSS", reason: `${total} under ${line}` };
    if (side.includes("under")) return total < line ? { result: "WIN", reason: `${total} under ${line}` } : { result: "LOSS", reason: `${total} over ${line}` };
    return { result: "OPEN", reason: "Total side missing" };
  }
  const winnerId = row.event.eventResult.winnerCompetitorId;
  if (!winnerId) return { result: "OPEN", reason: "winnerCompetitorId missing" };
  const pickId = selectedId(row.event, m.side ?? m.selection);
  if (!pickId) return { result: "OPEN", reason: "Could not map pick to participant" };
  return pickId === winnerId ? { result: "WIN", reason: "Pick matched winner" } : { result: "LOSS", reason: "Pick did not match winner" };
}
async function recomputeCumulativeProfit(definitionId: string) {
  const rows = await db.savedTrendMatch.findMany({
    where: { trendDefinitionId: definitionId },
    orderBy: [{ matchedAt: "asc" }, { id: "asc" }]
  });
  let running = 0;
  let rowsUpdated = 0;
  for (const row of rows) {
    if (isLedgerResult(row.betResult)) {
      running += n(row.unitsWon) ?? 0;
    }
    const cumulativeProfit = Number(running.toFixed(2));
    if (n(row.cumulativeProfit) !== cumulativeProfit) {
      await db.savedTrendMatch.update({
        where: { id: row.id },
        data: { cumulativeProfit }
      });
      rowsUpdated += 1;
    }
  }
  return rowsUpdated;
}
async function snapshot(definitionId: string) {
  const rows = await db.savedTrendMatch.findMany({ where: { trendDefinitionId: definitionId }, orderBy: { matchedAt: "desc" } });
  const graded = rows.filter((row: any) => ["WIN", "LOSS", "PUSH"].includes(String(row.betResult)));
  const wins = graded.filter((row: any) => row.betResult === "WIN").length;
  const losses = graded.filter((row: any) => row.betResult === "LOSS").length;
  const pushes = graded.filter((row: any) => row.betResult === "PUSH").length;
  const totalProfit = Number(graded.reduce((sum: number, row: any) => sum + (n(row.unitsWon) ?? 0), 0).toFixed(2));
  const totalGames = graded.length;
  const winPercentage = totalGames ? Number(((wins / totalGames) * 100).toFixed(1)) : 0;
  const roi = totalGames ? Number(((totalProfit / totalGames) * 100).toFixed(1)) : 0;
  const activeGameCount = rows.filter((row: any) => row.betResult === "OPEN").length;
  const clvValues = graded.map((row: any) => n(meta(row).clvPct)).filter((value: number | null): value is number => value != null);
  const avgClvPct = clvValues.length ? Number((clvValues.reduce((sum: number, value: number) => sum + value, 0) / clvValues.length).toFixed(2)) : null;
  await db.savedTrendSnapshot.create({
    data: {
      trendDefinitionId: definitionId,
      totalGames, wins, losses, pushes, winPercentage, roi, totalProfit,
      currentStreak: "N/A",
      streakType: null,
      pValue: null,
      chiSquareStat: null,
      isStatisticallySignificant: false,
      confidenceScore: Math.min(100, Math.max(0, winPercentage + roi)),
      sampleSizeRating: totalGames >= 75 ? "medium" : totalGames >= 25 ? "thin" : "starter",
      warningsJson: json([
        totalGames < 25 ? `Starter graded sample (${totalGames})` : null,
        activeGameCount ? `${activeGameCount} open` : null,
        avgClvPct == null ? "CLV unavailable until closing odds are captured" : `Average CLV ${avgClvPct}%`
      ].filter(Boolean)),
      activeGameCount
    }
  });
  await db.savedTrendDefinition.update({
    where: { id: definitionId },
    data: {
      currentStatsJson: json({ totalGames, wins, losses, pushes, winPercentage, roi, totalProfit, activeGameCount, avgClvPct, source: "saved-trend-match-ledger" }),
      lastComputedAt: new Date()
    }
  });
}

export async function gradeCapturedTrendSystemMatches(args?: { limit?: number }) {
  const source = getServerDatabaseResolution().key;
  if (!hasUsableServerDatabaseUrl()) return { ok: false, generatedAt: new Date().toISOString(), database: { usable: false, source }, summary: { openMatchesScanned: 0, gradedMatches: 0, skippedOpen: 0, snapshotsWritten: 0, cumulativeRecomputed: 0, cumulativeRowsUpdated: 0, wins: 0, losses: 0, pushes: 0, voids: 0 }, graded: [], skipped: [] };
  const rows = await db.savedTrendMatch.findMany({
    where: { betResult: "OPEN", trendDefinition: { isSystemGenerated: true }, event: { eventResult: { isNot: null } } },
    include: { trendDefinition: true, event: { include: { eventResult: true, participants: { include: { competitor: true } } } } },
    orderBy: { matchedAt: "asc" },
    take: Math.min(Math.max(args?.limit ?? 200, 1), 1000)
  });
  const touched = new Set<string>();
  const graded: any[] = [];
  const skipped: any[] = [];
  for (const row of rows) {
    const g = grade(row);
    if (g.result === "OPEN") { skipped.push({ matchId: row.id, eventId: row.eventId ?? null, eventLabel: row.event?.name ?? null, reason: g.reason }); continue; }
    const m = meta(row);
    const openOdds = n(m.openingOddsAmerican) ?? n(m.price);
    const closeOdds = n(m.closingOddsAmerican);
    const rowClvPct = clvPct(openOdds, closeOdds);
    const unitsWon = profit(g.result, openOdds);
    const nextMetadata = {
      ...m,
      openOddsAmerican: openOdds,
      openingOddsAmerican: openOdds,
      closingOddsAmerican: closeOdds,
      clvPct: rowClvPct,
      clvStatus: clvStatus(openOdds, closeOdds),
      gradedAt: new Date().toISOString(),
      gradeReason: g.reason,
      grader: "trend-system-grader"
    };
    await db.savedTrendMatch.update({
      where: { id: row.id },
      data: {
        betResult: g.result,
        unitsWon,
        cumulativeProfit: n(row.cumulativeProfit) ?? unitsWon,
        metadataJson: json(nextMetadata)
      }
    });
    touched.add(row.trendDefinitionId);
    graded.push({ matchId: row.id, trendDefinitionId: row.trendDefinitionId, eventId: row.eventId, eventLabel: row.event?.name ?? "Unknown event", newResult: g.result, unitsWon, clvPct: rowClvPct, clvStatus: nextMetadata.clvStatus, reason: g.reason });
  }
  let cumulativeRowsUpdated = 0;
  for (const id of touched) {
    cumulativeRowsUpdated += await recomputeCumulativeProfit(id);
    await snapshot(id);
  }
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    database: { usable: true, source },
    summary: {
      openMatchesScanned: rows.length,
      gradedMatches: graded.length,
      skippedOpen: skipped.length,
      snapshotsWritten: touched.size,
      cumulativeRecomputed: touched.size,
      cumulativeRowsUpdated,
      wins: graded.filter((r) => r.newResult === "WIN").length,
      losses: graded.filter((r) => r.newResult === "LOSS").length,
      pushes: graded.filter((r) => r.newResult === "PUSH").length,
      voids: graded.filter((r) => r.newResult === "VOID").length
    },
    graded,
    skipped
  };
}

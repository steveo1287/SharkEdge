import { createHash } from "node:crypto";

import { getResultsCenter, type ResultsLedgerRow, type ResultsMarket, type ResultsStatus } from "@/services/results/mlb-results-center";

export type LockedPickTicket = {
  ticketId: string;
  sourceRowId: string;
  market: ResultsMarket;
  marketLabel: string;
  eventLabel: string;
  pickLabel: string;
  sideLabel: string;
  result: ResultsStatus;
  lockStatus: ResultsLedgerRow["lockStatus"];
  modelProbabilityPct: number | null;
  marketProbabilityPct: number | null;
  edgePct: number | null;
  oddsAmerican: number | null;
  units: number | null;
  capturedAt: string | null;
  settledAt: string | null;
  rowHref: string;
  href: string;
  proofHash: string;
  integrity: {
    settled: boolean;
    pending: boolean;
    hasActualOdds: boolean;
    usesFallbackOdds: boolean;
    visibleMiss: boolean;
  };
};

function round(value: number | null | undefined, digits = 2) {
  return typeof value === "number" && Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function proofHash(payload: unknown) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
}

function ticketIdFor(row: ResultsLedgerRow) {
  return `se-${proofHash([row.id, row.market, row.pickLabel, row.eventLabel, row.capturedAt])}`;
}

export function rowToLockedPickTicket(row: ResultsLedgerRow): LockedPickTicket {
  const ticketId = ticketIdFor(row);
  const settled = row.result === "WIN" || row.result === "LOSS" || row.result === "PUSH";
  const pending = !settled;
  const hasActualOdds = row.oddsAmerican !== null;
  return {
    ticketId,
    sourceRowId: row.id,
    market: row.market,
    marketLabel: row.marketLabel,
    eventLabel: row.eventLabel,
    pickLabel: row.pickLabel,
    sideLabel: row.sideLabel,
    result: row.result,
    lockStatus: row.lockStatus,
    modelProbabilityPct: round(row.modelProbability == null ? null : row.modelProbability * 100, 1),
    marketProbabilityPct: round(row.marketProbability == null ? null : row.marketProbability * 100, 1),
    edgePct: round(row.edgePct, 1),
    oddsAmerican: row.oddsAmerican,
    units: row.units,
    capturedAt: row.capturedAt,
    settledAt: row.settledAt,
    rowHref: row.detailHref,
    href: `/tickets/${ticketId}`,
    proofHash: proofHash(row),
    integrity: {
      settled,
      pending,
      hasActualOdds,
      usesFallbackOdds: settled && !hasActualOdds,
      visibleMiss: row.result === "LOSS"
    }
  };
}

export async function getLockedPickTickets(limit = 100) {
  const data = await getResultsCenter("overview");
  const tickets = data.rows.slice(0, limit).map(rowToLockedPickTicket);
  const settled = tickets.filter((ticket) => ticket.integrity.settled).length;
  const losses = tickets.filter((ticket) => ticket.result === "LOSS").length;
  const pending = tickets.filter((ticket) => ticket.integrity.pending).length;
  const actualOdds = tickets.filter((ticket) => ticket.integrity.hasActualOdds).length;
  const fallbackOdds = tickets.filter((ticket) => ticket.integrity.usesFallbackOdds).length;

  return {
    ok: data.ok,
    generatedAt: new Date().toISOString(),
    sourceGeneratedAt: data.generatedAt,
    summary: {
      ticketCount: tickets.length,
      settled,
      losses,
      pending,
      actualOdds,
      fallbackOdds
    },
    tickets,
    warnings: data.warnings
  };
}

export async function getLockedPickTicket(ticketId: string) {
  const data = await getLockedPickTickets(200);
  return data.tickets.find((ticket) => ticket.ticketId === ticketId) ?? null;
}

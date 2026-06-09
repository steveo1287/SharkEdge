import { getLockedPickTickets } from "@/services/proof/locked-pick-tickets";
import { getResultsCenter, type ResultsMarket } from "@/services/results/mlb-results-center";

export type PublicRecordLane = {
  key: ResultsMarket;
  label: string;
  href: string;
  record: string;
  wins: number;
  losses: number;
  pushes: number;
  pending: number;
  winRatePct: number | null;
  unitsNet: number | null;
  roiPct: number | null;
  actualOddsCount: number;
  fallbackOddsCount: number;
  note: string;
};

export type PublicRecordClaim = {
  key: string;
  label: string;
  value: string;
  detail: string;
  status: "PUBLIC" | "CAUTION" | "NEEDS_SAMPLE";
};

function signedUnits(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}u`;
}

function pct(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

function record(wins: number, losses: number, pushes: number) {
  return `${wins}-${losses}${pushes ? `-${pushes}` : ""}`;
}

export async function getPublicRecordBoard() {
  const [results, ticketData] = await Promise.all([
    getResultsCenter("overview"),
    getLockedPickTickets(200)
  ]);

  const lanes: PublicRecordLane[] = results.marketCards.map((card) => ({
    key: card.key,
    label: card.label,
    href: card.href,
    record: record(card.summary.wins, card.summary.losses, card.summary.pushes),
    wins: card.summary.wins,
    losses: card.summary.losses,
    pushes: card.summary.pushes,
    pending: card.summary.pending,
    winRatePct: card.summary.winRatePct,
    unitsNet: card.summary.unitsNet,
    roiPct: card.summary.roiPct,
    actualOddsCount: card.summary.actualOddsCount,
    fallbackOddsCount: card.summary.fallbackOddsCount,
    note: card.note
  }));

  const settled = ticketData.tickets.filter((ticket) => ticket.integrity.settled).length;
  const visibleMisses = ticketData.tickets.filter((ticket) => ticket.integrity.visibleMiss).length;
  const actualOdds = ticketData.tickets.filter((ticket) => ticket.integrity.hasActualOdds).length;
  const fallbackOdds = ticketData.tickets.filter((ticket) => ticket.integrity.usesFallbackOdds).length;
  const sampleStatus = settled >= 100 ? "PUBLIC" : settled >= 25 ? "CAUTION" : "NEEDS_SAMPLE";

  const claims: PublicRecordClaim[] = [
    {
      key: "record",
      label: "Overall record",
      value: record(results.summary.wins, results.summary.losses, results.summary.pushes),
      detail: `${results.summary.pending} pending rows remain visible.` ,
      status: sampleStatus
    },
    {
      key: "units",
      label: "Units net",
      value: signedUnits(results.summary.unitsNet),
      detail: `${results.summary.actualOddsCount} actual odds rows, ${results.summary.fallbackOddsCount} fallback rows.` ,
      status: results.summary.unitsNet == null ? "NEEDS_SAMPLE" : sampleStatus
    },
    {
      key: "win_rate",
      label: "Win rate",
      value: pct(results.summary.winRatePct),
      detail: "Calculated from wins and losses only. Pushes are excluded.",
      status: sampleStatus
    },
    {
      key: "visible_misses",
      label: "Visible misses",
      value: String(visibleMisses),
      detail: "Losses are shown in the public ledger instead of hidden from the product.",
      status: visibleMisses > 0 ? "PUBLIC" : "CAUTION"
    },
    {
      key: "odds_proof",
      label: "Odds transparency",
      value: `${actualOdds}/${ticketData.tickets.length}`,
      detail: `${fallbackOdds} settled tickets currently use fallback odds markers.` ,
      status: actualOdds > 0 ? "PUBLIC" : "CAUTION"
    }
  ];

  return {
    ok: results.ok,
    generatedAt: new Date().toISOString(),
    windowLabel: results.windowLabel,
    headline: {
      record: record(results.summary.wins, results.summary.losses, results.summary.pushes),
      pending: results.summary.pending,
      unitsNet: results.summary.unitsNet,
      roiPct: results.summary.roiPct,
      winRatePct: results.summary.winRatePct,
      settledTickets: settled,
      ticketCount: ticketData.tickets.length
    },
    claims,
    lanes,
    recentTickets: ticketData.tickets.slice(0, 12),
    warnings: [...new Set([...results.warnings, ...ticketData.warnings])].slice(0, 8)
  };
}

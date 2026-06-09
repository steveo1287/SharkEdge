import { getLockedPickTickets } from "@/services/proof/locked-pick-tickets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const columns = [
  "ticketId",
  "market",
  "eventLabel",
  "pickLabel",
  "result",
  "lockStatus",
  "modelProbabilityPct",
  "marketProbabilityPct",
  "edgePct",
  "oddsAmerican",
  "units",
  "capturedAt",
  "settledAt",
  "proofHash",
  "hasActualOdds",
  "usesFallbackOdds",
  "visibleMiss",
  "sourceRowId"
] as const;

function csvValue(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET() {
  const data = await getLockedPickTickets(200);
  const rows = data.tickets.map((ticket) => [
    ticket.ticketId,
    ticket.market,
    ticket.eventLabel,
    ticket.pickLabel,
    ticket.result,
    ticket.lockStatus,
    ticket.modelProbabilityPct,
    ticket.marketProbabilityPct,
    ticket.edgePct,
    ticket.oddsAmerican,
    ticket.units,
    ticket.capturedAt,
    ticket.settledAt,
    ticket.proofHash,
    ticket.integrity.hasActualOdds,
    ticket.integrity.usesFallbackOdds,
    ticket.integrity.visibleMiss,
    ticket.sourceRowId
  ]);
  const csv = [columns.join(","), ...rows.map((row) => row.map(csvValue).join(","))].join("\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sharkedge-locked-tickets-${new Date().toISOString().slice(0, 10)}.csv"`
    }
  });
}

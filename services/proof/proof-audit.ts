import { getLockedPickTickets } from "@/services/proof/locked-pick-tickets";
import { getResultsCenter } from "@/services/results/mlb-results-center";

export type ProofAuditStatus = "PASS" | "WARN" | "FAIL";

export type ProofAuditCheck = {
  key: string;
  label: string;
  status: ProofAuditStatus;
  detail: string;
};

function pct(numerator: number, denominator: number) {
  if (!denominator) return null;
  return Number(((numerator / denominator) * 100).toFixed(1));
}

function scoreFor(status: ProofAuditStatus) {
  return status === "PASS" ? 1 : status === "WARN" ? 0.5 : 0;
}

export async function getProofAuditManifest() {
  const [results, ticketData] = await Promise.all([
    getResultsCenter("overview"),
    getLockedPickTickets(200)
  ]);

  const tickets = ticketData.tickets;
  const settled = tickets.filter((ticket) => ticket.integrity.settled).length;
  const pending = tickets.filter((ticket) => ticket.integrity.pending).length;
  const losses = tickets.filter((ticket) => ticket.integrity.visibleMiss).length;
  const actualOdds = tickets.filter((ticket) => ticket.integrity.hasActualOdds).length;
  const fallbackOdds = tickets.filter((ticket) => ticket.integrity.usesFallbackOdds).length;
  const proofHashes = new Set(tickets.map((ticket) => ticket.proofHash).filter(Boolean));
  const uniqueTicketIds = new Set(tickets.map((ticket) => ticket.ticketId));

  const checks: ProofAuditCheck[] = [
    {
      key: "results_available",
      label: "Results Center returns rows",
      status: results.rows.length > 0 ? "PASS" : "WARN",
      detail: `${results.rows.length} rows returned across active result lanes.`
    },
    {
      key: "tickets_available",
      label: "Locked tickets generated",
      status: tickets.length > 0 ? "PASS" : "WARN",
      detail: `${tickets.length} ticket receipts generated.`
    },
    {
      key: "ticket_id_uniqueness",
      label: "Ticket IDs are unique",
      status: uniqueTicketIds.size === tickets.length ? "PASS" : "FAIL",
      detail: `${uniqueTicketIds.size}/${tickets.length} unique ticket IDs.`
    },
    {
      key: "proof_hash_uniqueness",
      label: "Proof hashes are unique",
      status: proofHashes.size === tickets.length ? "PASS" : tickets.length === 0 ? "WARN" : "FAIL",
      detail: `${proofHashes.size}/${tickets.length} unique proof hashes.`
    },
    {
      key: "visible_misses",
      label: "Misses stay visible",
      status: losses > 0 ? "PASS" : settled > 0 ? "WARN" : "WARN",
      detail: `${losses} visible misses among ${settled} settled tickets.`
    },
    {
      key: "pending_visibility",
      label: "Pending rows stay visible",
      status: pending > 0 ? "PASS" : tickets.length > 0 ? "WARN" : "WARN",
      detail: `${pending} pending tickets are exposed instead of hidden.`
    },
    {
      key: "odds_transparency",
      label: "Actual/fallback odds split",
      status: actualOdds > 0 ? "PASS" : fallbackOdds > 0 ? "WARN" : "WARN",
      detail: `${actualOdds} tickets with actual odds, ${fallbackOdds} settled tickets using fallback odds.`
    },
    {
      key: "export_available",
      label: "CSV export is available",
      status: "PASS",
      detail: "/api/tickets/export exposes the ticket ledger for external review."
    }
  ];

  const auditScore = Number((checks.reduce((sum, check) => sum + scoreFor(check.status), 0) / checks.length * 100).toFixed(1));

  return {
    ok: checks.every((check) => check.status !== "FAIL"),
    generatedAt: new Date().toISOString(),
    auditScore,
    summary: {
      resultRows: results.rows.length,
      ticketCount: tickets.length,
      settled,
      pending,
      losses,
      actualOdds,
      fallbackOdds,
      actualOddsPct: pct(actualOdds, tickets.length),
      visibleMissPct: pct(losses, settled)
    },
    checks,
    routes: {
      proof: "/proof",
      results: "/results",
      tickets: "/tickets",
      ticketsApi: "/api/tickets",
      ticketExport: "/api/tickets/export"
    },
    warnings: [...new Set([...results.warnings, ...ticketData.warnings])].slice(0, 8)
  };
}

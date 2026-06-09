import { getProofAuditManifest } from "@/services/proof/proof-audit";
import { getProofBadgeData } from "@/services/proof/proof-badge";
import { getPublicRecordBoard } from "@/services/proof/public-record-board";

export type ComparisonRow = {
  capability: string;
  pickCardProduct: string;
  sharkEdge: string;
  status: "LIVE" | "PARTIAL" | "PLANNED";
};

function statusFromAudit(score: number) {
  if (score >= 90) return "LIVE" as const;
  if (score >= 60) return "PARTIAL" as const;
  return "PLANNED" as const;
}

export async function getProofComparison() {
  const [record, audit, badge] = await Promise.all([
    getPublicRecordBoard(),
    getProofAuditManifest(),
    getProofBadgeData()
  ]);

  const rows: ComparisonRow[] = [
    {
      capability: "Public record",
      pickCardProduct: "Usually shown as screenshots or marketing copy.",
      sharkEdge: `Live record board: ${record.headline.record}, ${badge.units}, ${badge.tickets} tickets.`,
      status: record.headline.ticketCount > 0 ? "LIVE" : "PARTIAL"
    },
    {
      capability: "Visible misses",
      pickCardProduct: "Often buried or absent from promotional pages.",
      sharkEdge: `${audit.summary.losses} visible losses exposed in the receipt layer.`,
      status: audit.summary.losses > 0 ? "LIVE" : "PARTIAL"
    },
    {
      capability: "Permanent pick receipts",
      pickCardProduct: "A pick card may disappear after the event.",
      sharkEdge: `${audit.summary.ticketCount} locked tickets with stable IDs and proof hashes.`,
      status: audit.summary.ticketCount > 0 ? "LIVE" : "PARTIAL"
    },
    {
      capability: "Odds transparency",
      pickCardProduct: "Actual price and fallback handling are often unclear.",
      sharkEdge: `${audit.summary.actualOdds} actual-odds tickets and ${audit.summary.fallbackOdds} fallback-odds markers.`,
      status: audit.summary.actualOdds > 0 ? "LIVE" : "PARTIAL"
    },
    {
      capability: "Machine-readable proof",
      pickCardProduct: "Usually no public JSON/CSV feed.",
      sharkEdge: "Public JSON APIs and CSV export for ticket review.",
      status: "LIVE"
    },
    {
      capability: "Self-audit",
      pickCardProduct: "No separate audit manifest.",
      sharkEdge: `Audit manifest score: ${audit.auditScore}%.`,
      status: statusFromAudit(audit.auditScore)
    },
    {
      capability: "Embeddable record",
      pickCardProduct: "Static graphics need manual updating.",
      sharkEdge: "Live SVG proof badge generated from the record board.",
      status: "LIVE"
    }
  ];

  return {
    ok: record.ok && audit.ok,
    generatedAt: new Date().toISOString(),
    headline: {
      title: "Proof-first betting intelligence",
      subtitle: "A comparison between generic pick-card products and SharkEdge's receipt, audit, and record infrastructure.",
      record: record.headline.record,
      units: badge.units,
      roi: badge.roi,
      tickets: badge.tickets,
      auditScore: audit.auditScore
    },
    rows,
    publicRoutes: {
      record: "/record",
      proof: "/proof",
      tickets: "/tickets",
      audit: "/audit",
      badges: "/badges",
      recordApi: "/api/record",
      auditApi: "/api/audit",
      ticketsApi: "/api/tickets",
      ticketCsv: "/api/tickets/export",
      badgeSvg: "/api/badges/record"
    },
    warnings: [...new Set([...record.warnings, ...audit.warnings, ...badge.warnings])].slice(0, 8)
  };
}

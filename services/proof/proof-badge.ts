import { getPublicRecordBoard } from "@/services/proof/public-record-board";

function escapeXml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function units(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}u`;
}

function pct(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

export async function getProofBadgeData() {
  const board = await getPublicRecordBoard();
  return {
    generatedAt: board.generatedAt,
    record: board.headline.record,
    pending: board.headline.pending,
    units: units(board.headline.unitsNet),
    roi: pct(board.headline.roiPct),
    winRate: pct(board.headline.winRatePct),
    tickets: board.headline.ticketCount,
    settledTickets: board.headline.settledTickets,
    warnings: board.warnings
  };
}

export async function getProofBadgeSvg() {
  const badge = await getProofBadgeData();
  const title = "SharkEdge Proof";
  const subtitle = `Record ${badge.record} · ${badge.units} · ROI ${badge.roi}`;
  const footer = `${badge.tickets} tickets · ${badge.pending} pending · visible ledger`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="280" viewBox="0 0 760 280" role="img" aria-label="${escapeXml(title)}">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#02060b"/>
      <stop offset="0.55" stop-color="#06101b"/>
      <stop offset="1" stop-color="#03131a"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" x2="1">
      <stop offset="0" stop-color="#22d3ee"/>
      <stop offset="1" stop-color="#34d399"/>
    </linearGradient>
  </defs>
  <rect width="760" height="280" rx="30" fill="url(#bg)"/>
  <rect x="18" y="18" width="724" height="244" rx="24" fill="none" stroke="#164e63" stroke-opacity="0.7"/>
  <circle cx="76" cy="76" r="34" fill="#022c3a" stroke="#22d3ee" stroke-opacity="0.65"/>
  <text x="76" y="87" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="34" font-weight="900" fill="#67e8f9">S</text>
  <text x="128" y="62" font-family="Inter,Arial,sans-serif" font-size="14" font-weight="900" letter-spacing="4" fill="#67e8f9">SHARKEDGE</text>
  <text x="128" y="103" font-family="Inter,Arial,sans-serif" font-size="36" font-weight="900" fill="#ffffff">${escapeXml(title)}</text>
  <text x="128" y="138" font-family="Inter,Arial,sans-serif" font-size="18" font-weight="700" fill="#cbd5e1">${escapeXml(subtitle)}</text>
  <rect x="128" y="164" width="504" height="54" rx="16" fill="#020617" fill-opacity="0.72" stroke="#155e75" stroke-opacity="0.75"/>
  <text x="152" y="198" font-family="Inter,Arial,sans-serif" font-size="22" font-weight="900" fill="#a7f3d0">${escapeXml(badge.winRate)}</text>
  <text x="250" y="198" font-family="Inter,Arial,sans-serif" font-size="22" font-weight="900" fill="#e2e8f0">${escapeXml(badge.settledTickets)} settled</text>
  <text x="420" y="198" font-family="Inter,Arial,sans-serif" font-size="22" font-weight="900" fill="#e2e8f0">${escapeXml(badge.tickets)} tickets</text>
  <rect x="128" y="232" width="260" height="7" rx="4" fill="url(#accent)"/>
  <text x="408" y="241" font-family="Inter,Arial,sans-serif" font-size="13" font-weight="800" letter-spacing="1.5" fill="#94a3b8">${escapeXml(footer)}</text>
</svg>`;
}

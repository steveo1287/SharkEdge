type GameHistorySource = Record<string, any>;

type GameHistoryRow = {
  id: string;
  date: string;
  matchup: string;
  side: string;
  price: string;
  result: string;
  units: string;
  closingPrice: string;
  qualifyingReason: string;
  source: string;
};

function fmtDate(value: unknown) {
  if (!value) return "date TBD";
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtPrice(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return value ? String(value) : "price TBD";
  return value > 0 ? `+${value}` : String(value);
}

function fmtUnits(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return value ? String(value) : "units TBD";
  return `${value > 0 ? "+" : ""}${value.toFixed(Math.abs(value) >= 10 ? 1 : 2)}u`;
}

function clean(value: unknown, fallback: string) {
  if (value == null) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function firstDefined(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function historyCandidates(system: GameHistorySource) {
  const proof = system.proof ?? {};
  return [
    proof.gameHistory,
    proof.history,
    proof.results,
    proof.qualifiers,
    proof.ledger,
    proof.rows,
    proof.matches,
    system.gameHistory,
    system.history,
    system.results,
    system.qualifiers,
    system.ledger,
    system.rows,
    system.matches
  ].find((value) => Array.isArray(value)) as GameHistorySource[] | undefined;
}

function normalizeHistoryRow(row: GameHistorySource, index: number): GameHistoryRow {
  const date = firstDefined(row.date, row.gameDate, row.startTime, row.eventDate, row.createdAt, row.settledAt);
  const matchup = firstDefined(row.matchup, row.eventLabel, row.eventName, row.game, row.name, row.teams, row.fixture);
  const side = firstDefined(row.side, row.selection, row.betSide, row.team, row.subject, row.pick);
  const price = firstDefined(row.price, row.odds, row.oddsAmerican, row.openPrice, row.currentPrice, row.betPrice);
  const result = firstDefined(row.result, row.outcome, row.status, row.grade, row.settlement);
  const units = firstDefined(row.units, row.profitUnits, row.pnlUnits, row.netUnits, row.profit, row.pnl);
  const closingPrice = firstDefined(row.closingPrice, row.closePrice, row.closingOdds, row.closeOdds, row.closingOddsAmerican, row.clvPrice);
  const qualifyingReason = firstDefined(row.qualifyingReason, row.reason, row.why, row.rule, row.ruleMatch, row.tag, row.note);

  return {
    id: clean(firstDefined(row.id, row.gameId, row.eventId, `${index}`), `${index}`),
    date: fmtDate(date),
    matchup: clean(matchup, "matchup TBD"),
    side: clean(side, "side TBD"),
    price: fmtPrice(price),
    result: clean(result, "result TBD"),
    units: fmtUnits(units),
    closingPrice: fmtPrice(closingPrice),
    qualifyingReason: clean(qualifyingReason, "qualifying reason TBD"),
    source: "proof history"
  };
}

function currentQualifierRows(activeTrendRows: GameHistorySource[]) {
  return activeTrendRows.slice(0, 12).map((trend, index) => ({
    id: clean(firstDefined(trend.gameId, trend.id, `${index}`), `${index}`),
    date: fmtDate(trend.startTime),
    matchup: clean(trend.eventLabel, "current matchup"),
    side: clean(trend.side, "side TBD"),
    price: fmtPrice(trend.price),
    result: clean(trend.status, "current"),
    units: "pending",
    closingPrice: "pending",
    qualifyingReason: clean(firstDefined(trend.strength?.reasons?.[0], trend.reasons?.[0], trend.reason, trend.actionability), "current qualifier"),
    source: "current qualifier"
  }));
}

function proofSummaryRows(system: GameHistorySource) {
  const proof = system.proof ?? {};
  const record = clean(proof.record, "record TBD");
  const rows: GameHistoryRow[] = [];

  if (proof.wins || proof.losses || proof.pushes || proof.profitUnits || proof.roiPct) {
    rows.push({
      id: "proof-summary",
      date: "stored range",
      matchup: record,
      side: clean(firstDefined(proof.filters?.side, system.side), "all qualifying sides"),
      price: clean(firstDefined(proof.filters?.priceRange, proof.filters?.price, system.price), "range TBD"),
      result: `${proof.wins ?? "?"}-${proof.losses ?? "?"}${proof.pushes ? `-${proof.pushes}` : ""}`,
      units: fmtUnits(proof.profitUnits),
      closingPrice: proof.clvPct == null ? "CLV TBD" : `${proof.clvPct}% CLV`,
      qualifyingReason: clean(firstDefined(proof.description, system.reason, proof.filters?.label), "stored proof summary"),
      source: "proof summary"
    });
  }

  return rows;
}

export function buildGameHistoryRows(system: GameHistorySource, activeTrendRows: GameHistorySource[]) {
  const stored = historyCandidates(system);
  if (stored?.length) {
    return {
      status: "stored-history",
      rows: stored.slice(0, 80).map(normalizeHistoryRow),
      note: `${stored.length} stored qualifier row${stored.length === 1 ? "" : "s"} exposed by the proof packet.`
    };
  }

  const currentRows = currentQualifierRows(activeTrendRows);
  const summaryRows = proofSummaryRows(system);
  return {
    status: currentRows.length ? "current-qualifiers" : "summary-only",
    rows: [...currentRows, ...summaryRows],
    note: currentRows.length
      ? "Per-game historical rows are not exposed yet. Showing current attached qualifiers plus stored proof summary."
      : "Per-game historical rows are not exposed yet. Showing stored proof summary only."
  };
}

function ResultPill({ value }: { value: string }) {
  const upper = value.toUpperCase();
  const good = upper === "W" || upper.includes("WIN") || upper.includes("CASH") || upper.includes("FINAL_WON");
  const bad = upper === "L" || upper.includes("LOSS") || upper.includes("LOSE") || upper.includes("FINAL_LOST");
  const push = upper.includes("PUSH") || upper.includes("VOID") || upper.includes("PENDING");
  const klass = good
    ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
    : bad
      ? "border-red-400/25 bg-red-400/10 text-red-200"
      : push
        ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
        : "border-slate-500/25 bg-slate-800/60 text-slate-300";
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${klass}`}>{value}</span>;
}

export function GameHistoryTable({ system, activeTrendRows }: { system: GameHistorySource; activeTrendRows: GameHistorySource[] }) {
  const history = buildGameHistoryRows(system, activeTrendRows);
  const rows = history.rows;

  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Game-by-game history</div>
          <div className="mt-1 text-xs leading-5 text-slate-400">{history.note}</div>
        </div>
        <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-cyan-100">{rows.length} rows</span>
      </div>

      {rows.length ? (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-[980px] w-full border-collapse text-left text-xs">
            <thead className="bg-white/[0.04] text-[10px] uppercase tracking-[0.16em] text-slate-500">
              <tr>
                <th className="px-3 py-3">Date</th>
                <th className="px-3 py-3">Matchup</th>
                <th className="px-3 py-3">Side</th>
                <th className="px-3 py-3">Price</th>
                <th className="px-3 py-3">Result</th>
                <th className="px-3 py-3">Units</th>
                <th className="px-3 py-3">Closing price</th>
                <th className="px-3 py-3">Qualifying reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10 text-slate-300">
              {rows.map((row) => (
                <tr key={`${row.source}:${row.id}`} className="align-top">
                  <td className="whitespace-nowrap px-3 py-3 text-slate-400">{row.date}</td>
                  <td className="px-3 py-3 font-semibold text-white">{row.matchup}</td>
                  <td className="px-3 py-3">{row.side}</td>
                  <td className="whitespace-nowrap px-3 py-3 font-mono">{row.price}</td>
                  <td className="whitespace-nowrap px-3 py-3"><ResultPill value={row.result} /></td>
                  <td className="whitespace-nowrap px-3 py-3 font-mono">{row.units}</td>
                  <td className="whitespace-nowrap px-3 py-3 font-mono">{row.closingPrice}</td>
                  <td className="px-3 py-3 leading-5 text-slate-400">{row.qualifyingReason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-black/25 p-4 text-sm leading-6 text-slate-400">
          No historical qualifier rows are available from the current proof packet.
        </div>
      )}

      <div className="mt-3 text-[11px] leading-5 text-slate-500">
        Source mode: {history.status}. This table never fabricates settled results; it uses stored rows when exposed, otherwise it clearly labels current qualifiers and proof-summary rows.
      </div>
    </section>
  );
}

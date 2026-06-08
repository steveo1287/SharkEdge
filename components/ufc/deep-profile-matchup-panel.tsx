import { buildUfcDeepFighterProfileV2FromFeature } from "@/services/ufc/deep-fighter-profile-v2";
import { buildUfcDeepProfileMatchupEngine, type UfcDeepPhaseEdge, type UfcDeepProfileMatchup } from "@/services/ufc/deep-profile-matchup-engine";
import { applyUfcDeepProfileLearnedWeights, type UfcDeepProfileAdjustedSimInput } from "@/services/ufc/deep-profile-sim-adjuster";
import { loadUfcDeepProfileLearnedWeightsFromDb, type UfcDeepProfileLearnedWeights } from "@/services/ufc/deep-profile-weight-store";
import type { UfcFightIqDetail } from "@/services/ufc/card-feed";

function num(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return value.toFixed(digits);
}

function pct(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${Math.round(value * 100)}%`;
}

function label(value: string) {
  return value.toLowerCase().replace(/_/g, " ");
}

function pill(tone: "aqua" | "green" | "amber" | "red" | "slate" = "slate") {
  const tones = {
    aqua: "border-aqua/25 bg-aqua/10 text-aqua",
    green: "border-emerald-300/25 bg-emerald-300/10 text-emerald-200",
    amber: "border-amber-300/25 bg-amber-300/10 text-amber-200",
    red: "border-rose-300/25 bg-rose-300/10 text-rose-200",
    slate: "border-white/10 bg-white/[0.04] text-slate-300"
  };
  return `rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${tones[tone]}`;
}

function leaderTone(leader: "A" | "B" | "EVEN") {
  if (leader === "A") return "aqua";
  if (leader === "B") return "green";
  return "slate";
}

function buildMatchup(fight: UfcFightIqDetail | null): UfcDeepProfileMatchup | null {
  const aSnapshot = fight?.featureSnapshots?.fighterA;
  const bSnapshot = fight?.featureSnapshots?.fighterB;
  if (!fight || !aSnapshot || !bSnapshot) return null;
  try {
    const fighterA = buildUfcDeepFighterProfileV2FromFeature({
      fighterName: fight.fighters.fighterA.name,
      feature: aSnapshot,
      payload: aSnapshot.feature,
      generatedAt: aSnapshot.snapshotAt
    });
    const fighterB = buildUfcDeepFighterProfileV2FromFeature({
      fighterName: fight.fighters.fighterB.name,
      feature: bSnapshot,
      payload: bSnapshot.feature,
      generatedAt: bSnapshot.snapshotAt
    });
    return buildUfcDeepProfileMatchupEngine({ fighterA, fighterB, fightId: fight.fightId });
  } catch {
    return null;
  }
}

async function loadLearnedWeightsSafe(): Promise<UfcDeepProfileLearnedWeights | null> {
  try {
    const weights = await loadUfcDeepProfileLearnedWeightsFromDb(500);
    return weights.reportCount > 0 ? weights : null;
  } catch {
    return null;
  }
}

function MiniStat({ title, value, sub }: { title: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">{title}</div>
      <div className="mt-1 font-display text-xl font-black text-white">{value}</div>
      {sub ? <div className="mt-1 text-[11px] leading-4 text-slate-500">{sub}</div> : null}
    </div>
  );
}

function PhaseRow({ edge }: { edge: UfcDeepPhaseEdge }) {
  const tone = leaderTone(edge.leader);
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">{label(edge.phase)}</div>
          <div className="mt-1 text-sm font-semibold text-white">{edge.summary}</div>
        </div>
        <span className={pill(tone)}>{edge.leader === "EVEN" ? "even" : `side ${edge.leader}`}</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <MiniStat title="A" value={num(edge.fighterA, 1)} />
        <MiniStat title="B" value={num(edge.fighterB, 1)} />
        <MiniStat title="Edge" value={num(Math.abs(edge.edge), 1)} sub={`conf ${pct(edge.confidence)}`} />
      </div>
    </div>
  );
}

function LearnedWeightStrip({ adjusted, weights }: { adjusted: UfcDeepProfileAdjustedSimInput; weights: UfcDeepProfileLearnedWeights }) {
  return (
    <div className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.06] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[9px] font-black uppercase tracking-[0.16em] text-emerald-200">Learned calibration applied</div>
          <div className="mt-1 text-xs leading-5 text-emerald-100/80">{adjusted.summary}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={pill("green")}>{weights.reportCount} reports</span>
          <span className={pill("green")}>weight conf {pct(weights.confidence)}</span>
          <span className={pill(adjusted.confidenceCap < 0.82 ? "amber" : "green")}>cap {pct(adjusted.confidenceCap)}</span>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <MiniStat title="KO/TKO prior" value={pct(adjusted.methodPriors.koTko)} />
        <MiniStat title="Sub prior" value={pct(adjusted.methodPriors.submission)} />
        <MiniStat title="Decision prior" value={pct(adjusted.methodPriors.decision)} />
      </div>
      {adjusted.warnings.length ? <div className="mt-3 flex flex-wrap gap-2">{adjusted.warnings.map((warning) => <span key={warning} className={pill("amber")}>{warning}</span>)}</div> : null}
    </div>
  );
}

export async function UfcDeepProfileMatchupPanel({ fight, matchup = buildMatchup(fight) }: { fight: UfcFightIqDetail | null; matchup?: UfcDeepProfileMatchup | null }) {
  if (!fight) return null;
  if (!matchup) {
    return (
      <section className="rounded-[1.35rem] border border-white/10 bg-white/[0.04] p-4">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-aqua">Deep profile matchup</div>
        <h2 className="mt-1 font-display text-2xl font-black tracking-[-0.05em] text-white">Profile matchup pending</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">Deep profile matchup needs both fighter feature snapshots. Re-run UFC feature hydration and operational sim, then reload this fight.</p>
      </section>
    );
  }
  const learnedWeights = await loadLearnedWeightsSafe();
  const adjusted = learnedWeights ? applyUfcDeepProfileLearnedWeights(matchup, learnedWeights) : null;
  const overallEdge = adjusted?.adjustedOverallEdge ?? matchup.overallEdge;
  const topPhaseEdges = adjusted?.adjustedPhaseEdges ?? matchup.topPhaseEdges;
  const winPaths = adjusted?.adjustedWinPaths ?? matchup.winConditionPaths;
  const leaderName = overallEdge.leader === "A" ? matchup.fighterA.fighterName : overallEdge.leader === "B" ? matchup.fighterB.fighterName : "Even";
  return (
    <section className="rounded-[1.35rem] border border-aqua/20 bg-[radial-gradient(circle_at_top_left,rgba(0,210,255,0.14),transparent_18rem),rgba(255,255,255,0.04)] p-4 shadow-[0_24px_90px_rgba(0,0,0,0.24)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-aqua">Deep profile matchup</div>
          <h2 className="mt-1 font-display text-3xl font-black tracking-[-0.06em] text-white">Phase Edge Matrix</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{adjusted?.summary ?? matchup.summary}</p>
        </div>
        <div className="rounded-[1.1rem] border border-white/10 bg-black/25 p-3 text-right">
          <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Overall leader</div>
          <div className="mt-1 font-display text-2xl font-black text-white">{leaderName ?? "Even"}</div>
          <div className="mt-1 text-xs text-slate-500">edge {num(Math.abs(overallEdge.edge), 1)} · conf {pct(overallEdge.confidence)}</div>
          {adjusted ? <div className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-200">adjusted</div> : <div className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">raw</div>}
        </div>
      </div>
      {adjusted && learnedWeights ? <LearnedWeightStrip adjusted={adjusted} weights={learnedWeights} /> : null}
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {topPhaseEdges.slice(0, 4).map((edge) => <PhaseRow key={edge.phase} edge={edge} />)}
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
          <div className="mb-2 text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Best win paths</div>
          <div className="grid gap-2">
            {winPaths.slice(0, 4).map((path) => <div key={`${path.fighter}-${path.condition}`} className="flex items-center justify-between gap-3 text-xs"><span className="font-semibold text-white">{path.fighterName ?? `Side ${path.fighter}`}</span><span className="text-slate-400">{label(path.condition)} · {num(path.score, 1)}</span></div>)}
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
          <div className="mb-2 text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Danger zones</div>
          <div className="grid gap-2">
            {matchup.dangerZones.slice(0, 4).map((zone) => <div key={`${zone.type}-${zone.target}`} className="rounded-xl border border-amber-300/15 bg-amber-300/[0.05] p-2 text-xs leading-5 text-amber-100"><span className="font-black">{label(zone.type)}</span> · target {zone.target} · {num(zone.severity, 1)}<br /><span className="text-amber-100/75">{zone.summary}</span></div>)}
            {!matchup.dangerZones.length ? <div className="text-xs text-slate-500">No major deep-profile danger zones.</div> : null}
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
          <div className="mb-2 text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Round leverage</div>
          <div className="grid gap-2">
            {matchup.roundLeverage.slice(0, fight.scheduledRounds).map((row) => <div key={row.round} className="flex items-center justify-between gap-3 text-xs"><span className="font-mono text-slate-500">R{row.round}</span><span className="font-semibold text-white">{label(row.leverage)}</span><span className="text-slate-400">vol {num(row.volatility, 0)}</span></div>)}
          </div>
        </div>
      </div>
      {matchup.warnings.length ? <div className="mt-4 flex flex-wrap gap-2">{matchup.warnings.slice(0, 8).map((warning) => <span key={warning} className={pill("amber")}>{warning}</span>)}</div> : null}
    </section>
  );
}

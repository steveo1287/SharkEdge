import type { UfcCardDetail, UfcFightIqDetail } from "@/services/ufc/card-feed";
import { buildSharkFightCardSimSurface, buildSharkFightDetailSimSurface } from "@/services/ufc/sharkfight-sim-surface";

function pct(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${Math.round(value * 100)}%`;
}

function pctRaw(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${Math.round(value)}%`;
}

function odds(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return value > 0 ? `+${Math.round(value)}` : String(Math.round(value));
}

function edgePct(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
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

function SimMetric({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#06101b]/70 p-3">
      <div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-1 font-display text-2xl font-black tracking-[-0.04em] text-white">{value}</div>
      {sub ? <div className="mt-1 text-[11px] leading-4 text-slate-500">{sub}</div> : null}
    </div>
  );
}

function FightPathSnapshot({ fight }: { fight: UfcFightIqDetail }) {
  const prediction = fight.prediction;
  const pending = !prediction?.hasPrediction;
  const pickName = pending ? "Sim pending" : prediction?.pickName ?? "Pending";
  const fair = odds(prediction?.fairOddsAmerican);
  const book = odds(prediction?.sportsbookOddsAmerican);
  const edge = edgePct(prediction?.edgePct);
  const methodRows = [
    ["KO/TKO", fight.methodProbabilities?.KO_TKO],
    ["Submission", fight.methodProbabilities?.SUBMISSION],
    ["Decision", fight.methodProbabilities?.DECISION]
  ] as const;
  const topMethod = methodRows
    .filter((entry): entry is readonly [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]))
    .sort((a, b) => b[1] - a[1])[0] ?? null;
  const marketReady = typeof prediction?.sportsbookOddsAmerican === "number";

  return (
    <section className="rounded-[1.2rem] border border-aqua/15 bg-[radial-gradient(circle_at_top_left,rgba(0,210,255,0.11),transparent_14rem),rgba(255,255,255,0.035)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-aqua">Decision snapshot</div>
          <h3 className="mt-1 font-display text-2xl font-black tracking-[-0.05em] text-white">{pickName}</h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">
            {pending
              ? "This fight is loaded but still needs model output. Feature hydration and SharkSim must complete before edge or method paths are trusted."
              : fight.pathSummary[0] ?? "Model output is available, but no stored path summary was returned for this fight."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={pill(pending ? "amber" : "aqua")}>{pending ? "pending" : "sim ready"}</span>
          <span className={pill(marketReady ? "green" : "slate")}>{marketReady ? "market joined" : "no book line"}</span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SimMetric label="Pick" value={pickName} sub={prediction ? `${pct(prediction.fighterAWinProbability)} / ${pct(prediction.fighterBWinProbability)}` : "no prediction"} />
        <SimMetric label="Market edge" value={edge} sub={`fair ${fair} · book ${book}`} />
        <SimMetric label="Likely path" value={topMethod?.[0] ?? "--"} sub={topMethod ? pct(topMethod[1]) : "method pending"} />
        <SimMetric label="Data / confidence" value={fight.dataQualityGrade ?? "--"} sub={fight.confidenceGrade ?? "confidence pending"} />
      </div>
    </section>
  );
}

export function SharkFightCardCockpit({ card }: { card: UfcCardDetail }) {
  const surface = buildSharkFightCardSimSurface(card);
  return (
    <section className="rounded-[1.35rem] border border-aqua/15 bg-[radial-gradient(circle_at_top_right,rgba(0,210,255,0.12),transparent_18rem),rgba(255,255,255,0.04)] p-4 shadow-[0_24px_90px_rgba(0,0,0,0.24)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-aqua">SharkFight Sim cockpit</div>
          <h2 className="mt-1 font-display text-2xl font-black tracking-[-0.05em] text-white">Card intelligence at a glance</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Cached server-side SharkSim output, shadow-mode status, danger flags, method lanes, and data quality are surfaced before you drill into each fight.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={pill(card.providerStatus === "event-linked" ? "green" : "amber")}>{card.providerStatus}</span>
          <span className={pill(surface.dangerFlagCount ? "amber" : "green")}>{surface.dangerFlagCount} danger flags</span>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SimMetric label="Sim coverage" value={pctRaw(surface.simulationCoveragePct)} sub={`${surface.simulatedFightCount}/${surface.fightCount} fights cached`} />
        <SimMetric label="Avg pick power" value={pct(surface.averagePickProbability)} sub="mean probability of model picks" />
        <SimMetric label="Positive edges" value={surface.edgeFightCount} sub="fights with positive edge when odds exist" />
        <SimMetric label="Method lean" value={surface.dominantMethod ?? "--"} sub="most common projected fight path" />
        <SimMetric label="High confidence" value={surface.highConfidenceCount} sub="model confidence grade HIGH" />
        <SimMetric label="Shadow pending" value={surface.pendingShadowCount} sub="waiting on results" />
        <SimMetric label="Shadow resolved" value={surface.resolvedShadowCount} sub="available for calibration" />
        <SimMetric label="Data quality" value={card.dataQualityGrade ?? "--"} sub="weakest grade on card" />
      </div>
    </section>
  );
}

export function SharkFightDetailRibbon({ fight }: { fight: UfcFightIqDetail | null }) {
  if (!fight) return null;
  const surface = buildSharkFightDetailSimSurface(fight);
  const source = fight.activeEnsembleWeights?.source ?? "unknown";
  const skillWeight = fight.activeEnsembleWeights?.weights?.skillMarkov;
  const exchangeWeight = fight.activeEnsembleWeights?.weights?.exchangeMonteCarlo;
  return (
    <div className="grid gap-3">
      <FightPathSnapshot fight={fight} />
      <section className="rounded-[1.2rem] border border-white/10 bg-white/[0.04] p-3">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className={pill(surface.engineAgreement === "agreement" ? "green" : surface.engineAgreement === "disagreement" ? "amber" : "slate")}>engine {surface.engineAgreement}</span>
          <span className={pill(surface.dataCompletenessPct >= 80 ? "green" : surface.dataCompletenessPct >= 60 ? "amber" : "red")}>{pctRaw(surface.dataCompletenessPct)} data complete</span>
          <span className={pill("aqua")}>weights: {source}</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <SimMetric label="Pick probability" value={pct(surface.pickProbability)} sub={surface.pickSide ? `fighter ${surface.pickSide}` : "pending pick"} />
          <SimMetric label="Method lane" value={surface.methodLean ?? "--"} sub={pct(surface.methodLeanProbability)} />
          <SimMetric label="Top round lane" value={surface.topRoundOutcome ?? "--"} sub={pct(surface.topRoundProbability)} />
          <SimMetric label="Weight split" value={`${pct(skillWeight)} / ${pct(exchangeWeight)}`} sub="Markov / Exchange Monte Carlo" />
        </div>
      </section>
    </div>
  );
}

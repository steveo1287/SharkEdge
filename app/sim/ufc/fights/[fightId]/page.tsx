import Link from "next/link";
import { notFound } from "next/navigation";

import { SharkFightsHeader, UfcFightIqPanel } from "@/components/ufc/sharkfights-ufc";
import { getUfcFightIqDetail, type UfcFightIqDetail } from "@/services/ufc/card-feed";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 35;

type PageProps = {
  params: Promise<{ fightId: string }>;
};

type FightGateTone = "ready" | "watch" | "blocked";

function pct(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${Math.round(value * 100)}%`;
}

function gradeScore(value: string | null | undefined) {
  const grade = value?.toUpperCase();
  if (grade?.includes("HIGH") || grade === "A") return 100;
  if (grade?.includes("MEDIUM") || grade === "B") return 78;
  if (grade === "C") return 60;
  if (grade?.includes("LOW") || grade === "D") return 42;
  return 50;
}

function pickProbability(fight: UfcFightIqDetail) {
  const prediction = fight.prediction;
  if (!prediction?.hasPrediction || !prediction.pickFighterId) return null;
  return prediction.pickFighterId === prediction.fighterAId ? prediction.fighterAWinProbability : prediction.fighterBWinProbability;
}

function fightReadinessScore(fight: UfcFightIqDetail) {
  const prediction = fight.prediction;
  if (!prediction?.hasPrediction) return 0;
  let score = 20;
  score += Math.min(25, Math.round((pickProbability(fight) ?? 0) * 25));
  score += Math.min(20, gradeScore(fight.confidenceGrade) * 0.2);
  score += Math.min(20, gradeScore(fight.dataQualityGrade) * 0.2);
  score += fight.featureComparison.length ? 15 : 0;
  score -= Math.min(18, fight.dangerFlags.length * 6);
  return Math.max(0, Math.min(100, Math.round(score)));
}

function gateTone(score: number, fight: UfcFightIqDetail): FightGateTone {
  if (!fight.prediction?.hasPrediction) return "blocked";
  if (score >= 78 && fight.dangerFlags.length <= 1) return "ready";
  return "watch";
}

function toneClasses(tone: FightGateTone) {
  if (tone === "ready") return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  if (tone === "watch") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  return "border-rose-300/25 bg-rose-300/10 text-rose-100";
}

function pill(tone: "aqua" | "green" | "amber" | "red" | "slate" = "slate") {
  const tones = {
    aqua: "border-aqua/25 bg-aqua/10 text-aqua",
    green: "border-emerald-300/25 bg-emerald-300/10 text-emerald-200",
    amber: "border-amber-300/25 bg-amber-300/10 text-amber-200",
    red: "border-rose-300/25 bg-rose-300/10 text-rose-200",
    slate: "border-white/10 bg-white/[0.04] text-slate-300"
  };
  return `rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${tones[tone]}`;
}

function GateMetric({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="text-[9px] font-black uppercase tracking-[0.16em] opacity-70">{label}</div>
      <div className="mt-2 font-display text-2xl font-black tracking-[-0.05em] text-white">{value}</div>
      <p className="mt-1 text-[11px] leading-4 opacity-75">{sub}</p>
    </div>
  );
}

function topMethod(fight: UfcFightIqDetail) {
  const rows = [
    { label: "KO/TKO", value: fight.methodProbabilities?.KO_TKO },
    { label: "Submission", value: fight.methodProbabilities?.SUBMISSION },
    { label: "Decision", value: fight.methodProbabilities?.DECISION }
  ];
  return rows
    .filter((row) => typeof row.value === "number" && Number.isFinite(row.value))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0] ?? null;
}

function FightDecisionGate({ fight }: { fight: UfcFightIqDetail }) {
  const score = fightReadinessScore(fight);
  const tone = gateTone(score, fight);
  const prediction = fight.prediction;
  const method = topMethod(fight);
  const pickName = prediction?.hasPrediction ? prediction.pickName ?? "Pick pending" : "Sim pending";
  const label = tone === "ready" ? "Fight is decision-ready" : tone === "watch" ? "Fight is watchlist-only" : "Fight is not ready";
  const note = tone === "ready"
    ? "Model output, confidence, data quality, and danger flags are strong enough to review as a real decision surface."
    : tone === "watch"
      ? "Model output exists, but at least one trust input is weak. Use this as research, not a blind play."
      : "This fight has not produced a usable SharkSim prediction yet. Hydrate features and run the UFC sim pipeline first.";

  return (
    <section className={`rounded-[1.35rem] border p-4 shadow-[0_24px_90px_rgba(0,0,0,0.24)] ${toneClasses(tone)}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">Fight decision gate</div>
          <h2 className="mt-1 font-display text-2xl font-black tracking-[-0.05em] text-white">{label}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 opacity-80">{note}</p>
        </div>
        <div className="rounded-[1.15rem] border border-white/10 bg-black/25 px-4 py-3 text-right">
          <div className="text-[9px] font-black uppercase tracking-[0.16em] opacity-70">Readiness</div>
          <div className="font-display text-4xl font-black tracking-[-0.06em] text-white">{score}</div>
        </div>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <GateMetric label="Pick" value={pickName} sub={`Pick probability ${pct(pickProbability(fight))}`} />
        <GateMetric label="Method lane" value={method?.label ?? "--"} sub={method ? pct(method.value) : "method model pending"} />
        <GateMetric label="Trust" value={`${fight.dataQualityGrade ?? "--"} / ${fight.confidenceGrade ?? "--"}`} sub="Data grade and confidence grade." />
        <GateMetric label="Danger flags" value={fight.dangerFlags.length} sub={fight.dangerFlags[0] ?? "No stored danger flag."} />
      </div>
    </section>
  );
}

export default async function UfcFightLabFightPage({ params }: PageProps) {
  const { fightId } = await params;
  const fight = await getUfcFightIqDetail(fightId);
  if (!fight) notFound();

  return (
    <main className="min-h-screen bg-[#02060b] px-3 py-4 text-white sm:px-5">
      <div className="mx-auto grid max-w-5xl gap-4">
        <SharkFightsHeader
          title={`${fight.fighters.fighterA.name ?? "Fighter A"} vs ${fight.fighters.fighterB.name ?? "Fighter B"}`}
          subtitle="Full UFC Fight Lab detail: fight-path reasoning, method probabilities, round distribution, feature comparison, and engine diagnostics."
        />
        <div className="flex flex-wrap gap-2">
          <Link href={`/sim/ufc/cards/${fight.eventId}?fightId=${fight.fightId}`} className={pill("aqua")}>Back to card</Link>
          <Link href="/sim/ufc" className={pill("slate")}>UFC Lab</Link>
          <Link href="/sim" className={pill("slate")}>Sim hub</Link>
        </div>
        <FightDecisionGate fight={fight} />
        <UfcFightIqPanel fight={fight} />
      </div>
    </main>
  );
}

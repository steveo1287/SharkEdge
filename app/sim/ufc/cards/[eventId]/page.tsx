import Link from "next/link";
import { notFound } from "next/navigation";

import { UfcFighterRosterIntelligencePanel } from "@/components/ufc/fighter-roster-intelligence-panel";
import { SharkFightCardCockpit, SharkFightDetailRibbon } from "@/components/ufc/sharkfight-sim-surface";
import { SharkFightsHeader, UfcFightIqPanel, UfcFightList } from "@/components/ufc/sharkfights-ufc";
import { UfcSourceAuditPanel } from "@/components/ufc/source-audit-panel";
import { UfcSourceConsensusPanel } from "@/components/ufc/source-consensus-panel";
import { getUfcCardDetail, getUfcFightIqDetail, type UfcCardDetail } from "@/services/ufc/card-feed";
import { getUfcSourceAuditForEvent } from "@/services/ufc/source-audit";
import { buildUfcCardSourceConsensus } from "@/services/ufc/source-consensus";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ eventId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type GateTone = "ready" | "partial" | "blocked";

function pct(value: number, total: number) {
  if (!total) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

function pctValue(value: number) {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.round(value)}%`;
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

function gateClasses(tone: GateTone) {
  if (tone === "ready") return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  if (tone === "partial") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  return "border-rose-300/25 bg-rose-300/10 text-rose-100";
}

function gradeScore(grade: string | null | undefined) {
  const normalized = grade?.toUpperCase();
  if (normalized === "A") return 100;
  if (normalized === "B") return 82;
  if (normalized === "C") return 65;
  if (normalized === "D") return 45;
  if (normalized === "F") return 20;
  return 50;
}

function consensusScore(grade: string | null | undefined) {
  const normalized = grade?.toUpperCase();
  if (normalized?.includes("A")) return 100;
  if (normalized?.includes("B")) return 82;
  if (normalized?.includes("C")) return 65;
  if (normalized?.includes("D")) return 45;
  if (normalized?.includes("F")) return 20;
  return 55;
}

function cardReadinessScore(args: { card: UfcCardDetail; sourceCount: number; consensusGrade: string | null | undefined }) {
  const simulationPct = args.card.fightCount ? (args.card.simulatedFightCount / args.card.fightCount) * 100 : 0;
  const sourcePct = Math.min(100, args.sourceCount * 25);
  const providerScore = args.card.providerStatus.includes("linked") ? 100 : args.card.providerStatus === "legacy-date" ? 62 : 35;
  const dataScore = gradeScore(args.card.dataQualityGrade);
  const consensus = consensusScore(args.consensusGrade);
  const raw = simulationPct * 0.34 + sourcePct * 0.16 + providerScore * 0.18 + dataScore * 0.16 + consensus * 0.16;
  return Math.round(Math.max(0, Math.min(100, raw)));
}

function cardGateTone(score: number, card: UfcCardDetail, sourceCount: number): GateTone {
  if (card.fightCount === 0 || sourceCount === 0 || card.simulatedFightCount === 0) return "blocked";
  if (score >= 82 && card.simulatedFightCount >= card.fightCount) return "ready";
  return "partial";
}

function GateMetric({ label, value, sub, pass }: { label: string; value: string | number; sub: string; pass: boolean }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[9px] font-black uppercase tracking-[0.16em] opacity-70">{label}</div>
        <span className={pill(pass ? "green" : "amber")}>{pass ? "pass" : "watch"}</span>
      </div>
      <div className="mt-2 font-display text-2xl font-black tracking-[-0.05em] text-white">{value}</div>
      <p className="mt-1 text-[11px] leading-4 opacity-75">{sub}</p>
    </div>
  );
}

function CardDecisionGate({ card, sourceCount, consensusGrade }: { card: UfcCardDetail; sourceCount: number; consensusGrade: string | null | undefined }) {
  const score = cardReadinessScore({ card, sourceCount, consensusGrade });
  const tone = cardGateTone(score, card, sourceCount);
  const simulationPct = card.fightCount ? (card.simulatedFightCount / card.fightCount) * 100 : 0;
  const label = tone === "ready" ? "Decision-ready card" : tone === "partial" ? "Partial-trust card" : "Pipeline-only card";
  const action = tone === "ready"
    ? "Use fight-level panels to compare picks, edges, methods, and danger flags."
    : tone === "partial"
      ? "Treat this as a research card until remaining fights, books, or source checks catch up."
      : "Do not treat this card as actionable. Load fights, source audit, features, and SharkSim output first.";

  return (
    <section className={`rounded-[1.35rem] border p-4 shadow-[0_24px_90px_rgba(0,0,0,0.24)] ${gateClasses(tone)}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">Card decision gate</div>
          <h2 className="mt-1 font-display text-2xl font-black tracking-[-0.05em] text-white">{label}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 opacity-80">{action}</p>
        </div>
        <div className="rounded-[1.15rem] border border-white/10 bg-black/25 px-4 py-3 text-right">
          <div className="text-[9px] font-black uppercase tracking-[0.16em] opacity-70">Readiness</div>
          <div className="font-display text-4xl font-black tracking-[-0.06em] text-white">{score}</div>
        </div>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <GateMetric label="Simulation" value={pctValue(simulationPct)} sub={`${card.simulatedFightCount}/${card.fightCount} fights have cached predictions.`} pass={card.fightCount > 0 && card.simulatedFightCount >= card.fightCount} />
        <GateMetric label="Sources" value={sourceCount} sub="Provider rows contributing to the card audit." pass={sourceCount >= 2} />
        <GateMetric label="Provider link" value={card.providerStatus} sub="Event-linked beats legacy date grouping." pass={card.providerStatus.includes("linked")} />
        <GateMetric label="Data / consensus" value={`${card.dataQualityGrade ?? "--"} / ${consensusGrade ?? "--"}`} sub="Worst fight data grade and source consensus grade." pass={gradeScore(card.dataQualityGrade) >= 65 && consensusScore(consensusGrade) >= 65} />
      </div>
    </section>
  );
}

export default async function UfcFightLabCardPage({ params, searchParams }: PageProps) {
  const { eventId } = await params;
  const query = (await searchParams) ?? {};
  const fightId = typeof query.fightId === "string" ? query.fightId : null;
  const [card, audit] = await Promise.all([getUfcCardDetail(eventId), getUfcSourceAuditForEvent(eventId)]);
  if (!card) notFound();
  const consensus = buildUfcCardSourceConsensus(audit);
  const selectedFightId = fightId ?? card.fights[0]?.fightId ?? null;
  const selectedFight = selectedFightId ? await getUfcFightIqDetail(selectedFightId) : null;

  return (
    <main className="min-h-screen bg-[#02060b] px-3 py-4 text-white sm:px-5">
      <div className="mx-auto grid max-w-7xl gap-4">
        <SharkFightsHeader title={card.eventLabel} subtitle="MMA Fight Lab card detail: fight-by-fight SharkSim picks, cached ensemble output, source confidence, matchup consensus, method lanes, roster intelligence, and danger flags." />
        <div className="flex flex-wrap gap-2">
          <Link href="/sim/ufc" className={pill("slate")}>Back to MMA Lab</Link>
          <Link href="/sim" className={pill("slate")}>Sim hub</Link>
          <span className={pill("aqua")}>{card.fightCount} fights</span>
          <span className={pill(card.simulatedFightCount >= card.fightCount && card.fightCount > 0 ? "green" : "amber")}>{card.simulatedFightCount} simulated</span>
          <span className={pill(audit.sourceNames.length >= 2 ? "green" : "amber")}>{audit.sourceNames.length} providers</span>
          <span className={pill(consensus.overallGrade?.includes("A") || consensus.overallGrade?.includes("B") ? "green" : "amber")}>consensus {consensus.overallGrade}</span>
        </div>
        <CardDecisionGate card={card} sourceCount={audit.sourceNames.length} consensusGrade={consensus.overallGrade} />
        <SharkFightCardCockpit card={card} />
        <UfcFighterRosterIntelligencePanel card={card} />
        <UfcSourceConsensusPanel consensus={consensus} />
        <UfcSourceAuditPanel audit={audit} />
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_430px]">
          <div className="grid gap-3">
            <SharkFightDetailRibbon fight={selectedFight} />
            <UfcFightList card={card} selectedFightId={selectedFightId} />
          </div>
          <UfcFightIqPanel fight={selectedFight} />
        </section>
      </div>
    </main>
  );
}

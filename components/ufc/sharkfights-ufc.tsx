import Link from "next/link";

import type { UfcCardDetail, UfcCardSummary, UfcFightIqDetail } from "@/services/ufc/card-feed";
import type { UfcOperationalFeedCard } from "@/services/ufc/operational-feed";

function pct(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${Math.round(value * 100)}%`;
}

function odds(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return value > 0 ? `+${value}` : String(value);
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "Date TBD";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date TBD";
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function timeLabel(value: string | null | undefined) {
  if (!value) return "TBD";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "TBD";
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function shell(extra = "") {
  return `border border-white/10 bg-white/[0.045] shadow-[0_24px_90px_rgba(0,0,0,0.24)] backdrop-blur-xl ${extra}`;
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

function CardShell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={shell(`rounded-[1.35rem] p-4 ${className}`)}>{children}</section>;
}

export function SharkFightsHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="rounded-[1.5rem] border border-aqua/20 bg-[radial-gradient(circle_at_top_left,rgba(0,210,255,0.18),transparent_18rem),linear-gradient(135deg,rgba(5,18,32,0.98),rgba(2,7,13,0.98))] p-5 shadow-[0_28px_100px_rgba(0,0,0,0.36)]">
      <div className="text-[10px] font-black uppercase tracking-[0.22em] text-aqua">SharkFights</div>
      <h1 className="mt-2 font-display text-4xl font-black tracking-[-0.07em] text-white sm:text-5xl">{title}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">{subtitle}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/sharkfights/ufc" className={pill("aqua")}>UFC Fight IQ</Link>
        <Link href="/trends?league=UFC" className={pill("slate")}>SharkTrends UFC</Link>
        <Link href="/" className={pill("slate")}>Command Desk</Link>
      </div>
    </header>
  );
}

export function UfcCardGrid({ cards }: { cards: UfcCardSummary[] }) {
  if (!cards.length) {
    return <CardShell><div className="text-sm leading-6 text-slate-400">No cached UFC cards yet. Run the UFCStats smoke/ingest worker, then simulate the card to populate SharkFights.</div></CardShell>;
  }
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => (
        <Link key={card.eventId} href={`/sharkfights/ufc/cards/${card.eventId}`} className="rounded-[1.25rem] border border-white/10 bg-[#06101b]/80 p-4 transition hover:border-aqua/35 hover:bg-aqua/[0.045]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-aqua">{dateLabel(card.eventDate)}</div>
              <div className="mt-1 font-display text-2xl font-black tracking-[-0.04em] text-white">{card.eventLabel}</div>
            </div>
            <span className={pill(card.providerStatus === "cached" ? "green" : "amber")}>{card.providerStatus}</span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <MiniStat label="Fights" value={card.fightCount} />
            <MiniStat label="Sims" value={card.simulatedFightCount} />
            <MiniStat label="Quality" value={card.dataQualityGrade ?? "--"} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className={pill("slate")}>{card.shadowPendingCount} pending</span>
            <span className={pill("slate")}>{card.shadowResolvedCount} resolved</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-2 py-2"><div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</div><div className="mt-1 font-display text-lg font-black text-white">{value}</div></div>;
}

function pickProbability(fight: UfcOperationalFeedCard) {
  return fight.pickFighterId === fight.fighterAId ? fight.fighterAWinProbability : fight.fighterBWinProbability;
}

function methodLean(fight: UfcOperationalFeedCard) {
  const entries = Object.entries(fight.methodProbabilities).filter((item): item is [string, number] => typeof item[1] === "number");
  return entries.sort((a, b) => b[1] - a[1])[0]?.[0]?.replace("_", "/") ?? "--";
}

export function UfcFightList({ card, selectedFightId }: { card: UfcCardDetail; selectedFightId?: string | null }) {
  return (
    <div className="grid gap-3">
      {card.fights.map((fight) => {
        const selected = fight.fightId === selectedFightId;
        return (
          <Link key={fight.fightId} href={`/sharkfights/ufc/cards/${card.eventId}?fightId=${fight.fightId}`} className={`rounded-[1.2rem] border p-4 transition ${selected ? "border-aqua/45 bg-aqua/[0.07]" : "border-white/10 bg-[#06101b]/78 hover:border-aqua/35 hover:bg-aqua/[0.04]"}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{timeLabel(fight.fightDate)} · {fight.scheduledRounds} rounds</div>
                <div className="mt-1 font-display text-xl font-black tracking-[-0.04em] text-white">{fight.fighterAName ?? "Fighter A"} vs {fight.fighterBName ?? "Fighter B"}</div>
                <div className="mt-2 text-sm text-slate-400">Pick: <span className="font-black text-aqua">{fight.pickName ?? "Pending"}</span> · {pct(pickProbability(fight))} · {methodLean(fight)}</div>
              </div>
              <span className={pill(fight.confidenceGrade?.includes("HIGH") ? "green" : fight.confidenceGrade === "LOW" ? "amber" : "aqua")}>{fight.confidenceGrade ?? "--"}</span>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2">
              <MiniStat label="Fair" value={odds(fight.fairOddsAmerican)} />
              <MiniStat label="Book" value={odds(fight.sportsbookOddsAmerican)} />
              <MiniStat label="Edge" value={typeof fight.edgePct === "number" ? `${fight.edgePct}%` : "--"} />
              <MiniStat label="Data" value={fight.dataQualityGrade ?? "--"} />
            </div>
          </Link>
        );
      })}
    </div>
  );
}

export function UfcFightIqPanel({ fight }: { fight: UfcFightIqDetail | null }) {
  if (!fight) return <CardShell><div className="text-sm leading-6 text-slate-400">Select a fight to open the Fight IQ breakdown.</div></CardShell>;
  const prediction = fight.prediction;
  const pickName = prediction?.pickName ?? "Pending";
  const pickProb = prediction ? pct(pickProbability(prediction)) : "--";
  return (
    <CardShell className="lg:sticky lg:top-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-aqua">Fight IQ</div>
          <h2 className="mt-1 font-display text-2xl font-black tracking-[-0.05em] text-white">{pickName}</h2>
          <p className="mt-1 text-sm text-slate-400">Our projected winner · {pickProb}</p>
        </div>
        <Link href={`/sharkfights/ufc/fights/${fight.fightId}`} className={pill("aqua")}>Full</Link>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <MiniStat label="Confidence" value={fight.confidenceGrade ?? "--"} />
        <MiniStat label="Data" value={fight.dataQualityGrade ?? "--"} />
        <MiniStat label="Sim Count" value={prediction?.simulationCount ?? "--"} />
        <MiniStat label="Shadow" value={fight.shadowStatus ?? "--"} />
      </div>
      <Section title="Why this pick">
        {(fight.pathSummary.length ? fight.pathSummary : ["No path summary stored yet. Run the operational sim to populate explanation data."]).map((line, index) => <p key={index} className="text-sm leading-6 text-slate-300">{index + 1}. {line}</p>)}
      </Section>
      <Section title="Method probabilities"><MethodBars fight={fight} /></Section>
      <Section title="Round finish distribution"><RoundDistribution rounds={fight.roundFinishProbabilities} decision={fight.methodProbabilities?.DECISION ?? null} /></Section>
      <Section title="Fighter stat comparison"><StatCompare fight={fight} /></Section>
      <Section title="Engine breakdown"><EngineBreakdown fight={fight} /></Section>
      {fight.dangerFlags.length ? <Section title="Danger flags"><div className="flex flex-wrap gap-2">{fight.dangerFlags.map((flag) => <span key={flag} className={pill("amber")}>{flag}</span>)}</div></Section> : null}
    </CardShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="mt-5 border-t border-white/10 pt-4"><h3 className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-aqua">{title}</h3>{children}</div>;
}

function MethodBars({ fight }: { fight: UfcFightIqDetail }) {
  const methods = fight.methodProbabilities;
  const rows = [["KO/TKO", methods?.KO_TKO], ["Submission", methods?.SUBMISSION], ["Decision", methods?.DECISION]] as const;
  return <div className="grid gap-2">{rows.map(([label, value]) => <Bar key={label} label={label} value={typeof value === "number" ? value : 0} />)}</div>;
}

function RoundDistribution({ rounds, decision }: { rounds: Record<string, number>; decision: number | null }) {
  const rows = [...Object.entries(rounds), ["Decision", decision ?? 0] as [string, number]];
  return <div className="grid gap-2">{rows.map(([label, value]) => <Bar key={label} label={label} value={value} />)}</div>;
}

function Bar({ label, value }: { label: string; value: number }) {
  const width = Math.max(0, Math.min(100, Math.round(value * 100)));
  return <div><div className="mb-1 flex justify-between text-xs text-slate-400"><span>{label}</span><span>{width}%</span></div><div className="h-2 rounded-full bg-white/10"><div className="h-2 rounded-full bg-aqua" style={{ width: `${width}%` }} /></div></div>;
}

function StatCompare({ fight }: { fight: UfcFightIqDetail }) {
  return <div className="overflow-hidden rounded-2xl border border-white/10"><table className="w-full text-left text-xs"><tbody>{fight.featureComparison.map((row) => <tr key={row.label} className="border-b border-white/10 last:border-0"><td className="px-3 py-2 text-slate-500">{row.label}</td><td className="px-3 py-2 text-white">{row.fighterA ?? "--"}</td><td className="px-3 py-2 text-white">{row.fighterB ?? "--"}</td></tr>)}</tbody></table></div>;
}

function EngineBreakdown({ fight }: { fight: UfcFightIqDetail }) {
  const weights = fight.activeEnsembleWeights?.weights;
  const skill = fight.sourceOutputs?.skillMarkov?.fighterAWinProbability;
  const exchange = fight.sourceOutputs?.exchangeMonteCarlo?.fighterAWinProbability;
  return (
    <div className="grid gap-2 text-sm leading-6 text-slate-300">
      <p>Skill Markov weight: <span className="font-black text-white">{weights ? pct(weights.skillMarkov) : "--"}</span></p>
      <p>Exchange Monte Carlo weight: <span className="font-black text-white">{weights ? pct(weights.exchangeMonteCarlo) : "--"}</span></p>
      <p>Skill Markov Fighter A: <span className="font-black text-white">{pct(skill)}</span></p>
      <p>Exchange Monte Carlo Fighter A: <span className="font-black text-white">{pct(exchange)}</span></p>
    </div>
  );
}

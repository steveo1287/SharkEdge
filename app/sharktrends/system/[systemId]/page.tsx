import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { buildTrendsCenterSnapshot } from "@/services/trends/trends-center";
import { buildTrendStrengthScore } from "@/services/trends/trend-strength-score";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: Promise<{ systemId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type ChipKind = "good" | "watch" | "warn" | "bad" | "muted";

function readValue(searchParams: Record<string, string | string[] | undefined>, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function unit(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "TBD";
  return `${value > 0 ? "+" : ""}${value}u`;
}

function pct(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "TBD";
  return `${value}%`;
}

function price(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "price needed";
  return value > 0 ? `+${value}` : String(value);
}

function chipClass(kind: ChipKind) {
  if (kind === "good") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  if (kind === "watch") return "border-sky-400/25 bg-sky-400/10 text-sky-200";
  if (kind === "warn") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  if (kind === "bad") return "border-red-400/25 bg-red-400/10 text-red-200";
  return "border-slate-500/25 bg-slate-800/60 text-slate-300";
}

function actionKind(value: string | null | undefined): ChipKind {
  const action = String(value ?? "").toUpperCase();
  if (action.includes("ACTIONABLE") || action.includes("ACTIVE") || action.includes("PROMOTE")) return "good";
  if (action.includes("WATCH") || action.includes("REVIEW")) return "watch";
  if (action.includes("WAIT") || action.includes("RESEARCH")) return "warn";
  if (action.includes("PASS") || action.includes("BENCH")) return "bad";
  return "muted";
}

function gradeKind(grade: string | null | undefined): ChipKind {
  const value = String(grade ?? "").toUpperCase();
  if (value === "A") return "good";
  if (value === "B") return "watch";
  if (value === "C") return "warn";
  return "muted";
}

function scoreKind(score: number | null | undefined): ChipKind {
  const value = typeof score === "number" ? score : 0;
  if (value >= 82) return "good";
  if (value >= 68) return "watch";
  if (value >= 52) return "warn";
  return "bad";
}

function Chip({ children, kind = "muted" }: { children: ReactNode; kind?: ChipKind }) {
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.13em] ${chipClass(kind)}`}>{children}</span>;
}

function Stat({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      <div className="mt-2 text-xs leading-5 text-slate-400">{note}</div>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4">
      <div className="mb-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">{title}</div>
        <div className="mt-1 text-xs leading-5 text-slate-400">{description}</div>
      </div>
      {children}
    </section>
  );
}

function systemDetailHref(systemId: string, gameId?: string | null) {
  const params = new URLSearchParams();
  if (gameId) params.set("gameId", gameId);
  const suffix = params.toString();
  return `/sharktrends/system/${encodeURIComponent(systemId)}${suffix ? `?${suffix}` : ""}`;
}

function withStrength<T extends Record<string, any>>(item: T): T & { strength: ReturnType<typeof buildTrendStrengthScore> } {
  return { ...item, strength: buildTrendStrengthScore(item) };
}

function buildQualifyingChecks(system: any, selectedMatch: any | null) {
  const proof = system.proof ?? {};
  const filters = proof.filters ?? {};
  return [
    { label: "League", value: filters.league ?? system.league ?? "ALL", matched: true },
    { label: "Market", value: filters.market ?? system.market ?? "ALL", matched: true },
    { label: "Side", value: filters.side ?? selectedMatch?.side ?? "ALL", matched: Boolean(filters.side || selectedMatch?.side) },
    { label: "Window", value: filters.window ?? "stored", matched: true },
    { label: "Sample", value: String(proof.sampleSize ?? "TBD"), matched: Number(proof.sampleSize ?? 0) >= 75 },
    { label: "ROI", value: pct(proof.roiPct), matched: Number(proof.roiPct ?? 0) > 0 },
    { label: "Current price", value: price(selectedMatch?.price), matched: typeof selectedMatch?.price === "number" },
    { label: "Current edge", value: selectedMatch?.edgePct == null ? "edge TBD" : `${selectedMatch.edgePct}%`, matched: Number(selectedMatch?.edgePct ?? 0) > 0 }
  ];
}

function StrengthPanel({ strength, title }: { strength: ReturnType<typeof buildTrendStrengthScore>; title: string }) {
  return (
    <Section title={title} description="Score is calculated from proof, sample, ROI, units, hit rate, recent form, CLV, current price, edge, confidence, action gate, category, streak, and blockers.">
      <div className="grid gap-3 md:grid-cols-[220px_1fr_1fr]">
        <div className={`rounded-2xl border p-4 ${chipClass(scoreKind(strength.score))}`}>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-75">Trend Strength</div>
          <div className="mt-2 text-4xl font-semibold text-white">{strength.grade} {strength.score}</div>
          <div className="mt-2 text-xs leading-5 opacity-80">A transparent SharkEdge score, not just ROI sorting.</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">Reasons</div>
          <div className="mt-3 grid gap-2 text-xs leading-5 text-slate-300">
            {strength.reasons.length ? strength.reasons.map((reason) => <div key={reason}>• {reason}</div>) : <div className="text-slate-500">No positive score reasons were generated.</div>}
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300">Penalties</div>
          <div className="mt-3 grid gap-2 text-xs leading-5 text-slate-300">
            {strength.penalties.length ? strength.penalties.map((penalty) => <div key={penalty}>• {penalty}</div>) : <div className="text-slate-500">No penalties were applied.</div>}
          </div>
        </div>
      </div>
    </Section>
  );
}

function MatchCard({ trend, selected }: { trend: any; selected: boolean }) {
  return (
    <Link href={systemDetailHref(trend.systemId, trend.gameId)} className={`rounded-2xl border p-4 transition hover:border-cyan-300/30 ${selected ? "border-cyan-300/35 bg-cyan-300/[0.07]" : "border-white/10 bg-black/25"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">{trend.eventLabel ?? trend.name}</div>
          <div className="mt-1 text-xs leading-5 text-slate-500">{trend.league ?? "league"} · {trend.market} · {trend.side}</div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip kind={scoreKind(trend.strength?.score)}>Strength {trend.strength?.grade} · {trend.strength?.score}</Chip>
          <Chip kind={actionKind(trend.actionLabel ?? trend.actionability)}>{trend.actionLabel ?? trend.actionability ?? "review"}</Chip>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-400 sm:grid-cols-4">
        <span>{price(trend.price)}</span>
        <span>{trend.edgePct == null ? "edge TBD" : `${trend.edgePct}% edge`}</span>
        <span>{trend.confidencePct == null ? "confidence TBD" : `${trend.confidencePct}% conf`}</span>
        <span>Score {trend.sharkScore ?? trend.score ?? 0}</span>
      </div>
      <div className="mt-3 text-xs leading-5 text-slate-400">{trend.strength?.reasons?.[0] ?? trend.reasons?.[0] ?? "Strength score explains this matchup fit."}</div>
      {trend.blockers?.length ? <div className="mt-2 text-[11px] leading-5 text-red-100/80">Blockers: {trend.blockers.slice(0, 3).join(", ")}</div> : <div className="mt-2 text-[11px] text-emerald-200/80">No hard blockers listed.</div>}
    </Link>
  );
}

export default async function SharkTrendsSystemDetailPage({ params, searchParams }: PageProps) {
  const { systemId } = await params;
  const resolvedSearch = (await searchParams) ?? {};
  const selectedGameId = readValue(resolvedSearch, "gameId") ?? null;
  const snapshot = await buildTrendsCenterSnapshot();
  const rows = snapshot.allPromotionRows ?? [];
  const rawSystem = rows.find((row: any) => row.id === decodeURIComponent(systemId));

  if (!rawSystem) notFound();

  const system = withStrength(rawSystem);
  const activeTrendRows = (snapshot.matchupsByLeague ?? [])
    .flatMap((group: any) => (group.matchups ?? []).map((matchup: any) => ({ group, matchup })))
    .flatMap(({ group, matchup }: any) => (matchup.allTrends ?? matchup.trends ?? [])
      .filter((trend: any) => trend.systemId === system.id)
      .map((trend: any) => withStrength({ ...trend, eventLabel: matchup.eventLabel, startTime: matchup.startTime, status: matchup.status, league: group.league, matchupHref: matchup.href }))
    )
    .sort((left: any, right: any) => (right.strength?.score ?? 0) - (left.strength?.score ?? 0));

  const selectedTrend = activeTrendRows.find((trend: any) => trend.gameId === selectedGameId) ?? activeTrendRows[0] ?? null;
  const selectedStrength = selectedTrend?.strength ?? system.strength;
  const proof = system.proof ?? {};
  const checks = buildQualifyingChecks(system, selectedTrend);
  const rules = Array.isArray(proof.rules) ? proof.rules : [];
  const filters = proof.filters ?? {};

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/70 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">SharkTrends System Detail</div>
            <h1 className="mt-2 font-display text-3xl font-semibold leading-tight text-white md:text-4xl">{system.name}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{proof.description ?? system.reason ?? "System detail, proof summary, current matchups, filter DNA, blockers, and strength scoring."}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Chip kind={scoreKind(system.strength.score)}>Strength {system.strength.grade} · {system.strength.score}</Chip>
              <Chip kind={gradeKind(proof.grade)}>Grade {proof.grade ?? "P"}</Chip>
              <Chip kind={system.verified ? "good" : "warn"}>{system.verified ? "verified" : "provisional"}</Chip>
              <Chip kind={actionKind(system.actionLabel ?? system.primaryAction)}>{system.actionLabel ?? system.primaryAction ?? "research"}</Chip>
              <Chip kind={system.tier === "promote" ? "good" : system.tier === "watch" ? "watch" : system.tier === "bench" ? "bad" : "muted"}>{system.tier}</Chip>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.14em]">
            <Link href="/sharktrends" className="text-cyan-200 hover:text-cyan-100">Command board</Link>
            {system.href ? <Link href={system.href} className="text-cyan-200 hover:text-cyan-100">Filtered board</Link> : null}
            {selectedTrend?.matchupHref ? <Link href={selectedTrend.matchupHref} className="text-cyan-200 hover:text-cyan-100">Matchup</Link> : null}
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <Stat label="Strength" value={`${system.strength.grade} ${system.strength.score}`} note="Transparent weighted system score." />
        <Stat label="Record" value={proof.record ?? "TBD"} note="Full stored system record." />
        <Stat label="Profit" value={unit(proof.profitUnits)} note="Units from stored proof packet." />
        <Stat label="ROI" value={pct(proof.roiPct)} note="Return from historical qualifiers." />
        <Stat label="Win rate" value={pct(proof.winRatePct)} note="Hit rate across stored record." />
        <Stat label="CLV" value={pct(proof.clvPct)} note="Closing-line value, if available." />
      </section>

      <StrengthPanel title="System strength score" strength={system.strength} />
      {selectedTrend ? <StrengthPanel title="Selected matchup strength" strength={selectedStrength} /> : null}

      <Section title="Current attached matchups" description="These are today's games or current board events that match this system. The selected matchup drives the qualification checks below.">
        <div className="grid gap-3 xl:grid-cols-2">
          {activeTrendRows.length ? activeTrendRows.map((trend: any) => <MatchCard key={`${trend.systemId}:${trend.gameId}`} trend={trend} selected={trend.gameId === selectedTrend?.gameId} />) : <div className="rounded-xl border border-white/10 bg-black/25 p-4 text-sm leading-6 text-slate-400">No current matchups are attached to this system. It stays in research/idle status until a slate event qualifies.</div>}
        </div>
      </Section>

      <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <Section title="Filter DNA" description="The exact stored filters and rule structure that define this system.">
          <div className="grid gap-3 md:grid-cols-2">
            {Object.entries(filters).map(([key, value]) => <div key={key} className="rounded-xl border border-white/10 bg-black/25 p-3"><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{key}</div><div className="mt-1 text-sm text-white">{String(value)}</div></div>)}
            {!Object.keys(filters).length ? <div className="rounded-xl border border-white/10 bg-black/25 p-3 text-sm text-slate-400">No filter packet was exposed for this system.</div> : null}
          </div>
          <div className="mt-4 grid gap-2">
            {rules.length ? rules.map((rule: any) => <div key={`${rule.key}:${rule.value}`} className="rounded-xl border border-white/10 bg-black/25 p-3 text-sm text-slate-300"><span className="text-cyan-200">{rule.label ?? rule.key}</span> {rule.operator} <span className="text-white">{String(rule.value)}</span></div>) : <div className="rounded-xl border border-white/10 bg-black/25 p-3 text-sm text-slate-400">No rules were exposed for this system.</div>}
          </div>
        </Section>

        <Section title="Why it qualifies today" description="Checks for the selected attached matchup. Failed checks do not always kill the system, but they explain why it may stay in Watch or Research.">
          <div className="grid gap-2">
            {checks.map((check) => <div key={check.label} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/25 p-3"><div><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{check.label}</div><div className="mt-1 text-sm text-white">{check.value}</div></div><Chip kind={check.matched ? "good" : "warn"}>{check.matched ? "matched" : "watch"}</Chip></div>)}
          </div>
        </Section>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <Section title="Kill switches" description="Reasons this system should not be promoted without review.">
          <div className="grid gap-2">
            {system.blockers?.length ? system.blockers.map((blocker: string) => <div key={blocker} className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-100">{blocker}</div>) : <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-100">No hard system blockers listed.</div>}
            {selectedTrend?.blockers?.length ? selectedTrend.blockers.map((blocker: string) => <div key={`match:${blocker}`} className="rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">Selected matchup: {blocker}</div>) : null}
          </div>
        </Section>

        <Section title="Game history foundation" description="PR #162 should replace this placeholder with full qualifier history rows.">
          <div className="rounded-xl border border-white/10 bg-black/25 p-4 text-sm leading-6 text-slate-400">
            <div className="font-semibold text-white">History table planned fields</div>
            <div className="mt-2 grid gap-1 text-xs uppercase tracking-[0.12em] text-slate-500">
              <span>Date · matchup · side · price</span>
              <span>Result · units · closing price · CLV</span>
              <span>Qualifying tags · rule match explanation</span>
            </div>
            <div className="mt-3 text-xs leading-5 text-slate-400">Current proof packet already exposes record, wins, losses, pushes, ROI, units, win rate, streak, CLV, and seasons. The next data step is exposing per-game qualifier rows.</div>
          </div>
        </Section>
      </section>

      <Section title="Raw proof packet" description="Debug-friendly proof data kept visible while the deeper system pages are being hardened.">
        <pre className="max-h-[45vh] overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/30 p-4 text-xs leading-5 text-slate-300">{JSON.stringify({ system, selectedTrend, activeTrendCount: activeTrendRows.length }, null, 2)}</pre>
      </Section>
    </main>
  );
}

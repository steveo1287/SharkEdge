import Link from "next/link";

import { UfcPipelineStatusPanel } from "@/components/ufc/pipeline-status-panel";
import { SharkFightsHeader } from "@/components/ufc/sharkfights-ufc";
import type { UfcCardSummary } from "@/services/ufc/card-feed";
import { getUfcCards } from "@/services/ufc/card-feed";
import { discoverOfficialMmaCards, type MmaCardDiscoveryResult } from "@/services/ufc/mma-card-discovery";
import { getUfcPipelineStatus, type UfcPipelineStatus } from "@/services/ufc/pipeline-status";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 35;

type ReadinessTone = "ready" | "warn" | "cold";

function pct(value: number, total: number) {
  if (!total) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

function pctValue(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${Math.round(value)}%`;
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "TBD";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "TBD";
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function latestSim(cards: UfcCardSummary[]) {
  return cards
    .map((card) => card.lastSimulatedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
}

function isFeaturedCard(card: UfcCardSummary) {
  return card.fightCount > 0 && card.simulatedFightCount > 0 && card.dataQualityGrade !== "D";
}

function nextDisplayCard(cards: UfcCardSummary[]) {
  const now = Date.now() - 12 * 60 * 60 * 1000;
  return [...cards]
    .filter((card) => new Date(card.eventDate).getTime() >= now)
    .sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime())[0]
    ?? cards[0]
    ?? null;
}

function readinessTone(args: { fightCount: number; simulatedFightCount: number; pendingSimCount: number }): ReadinessTone {
  if (args.fightCount === 0) return "cold";
  if (args.simulatedFightCount > 0 && args.pendingSimCount === 0) return "ready";
  if (args.simulatedFightCount > 0 || args.pendingSimCount > 0) return "warn";
  return "cold";
}

function toneClasses(tone: ReadinessTone) {
  if (tone === "ready") return "border-emerald-300/25 bg-emerald-300/10 text-emerald-200";
  if (tone === "warn") return "border-amber-300/25 bg-amber-300/10 text-amber-200";
  return "border-white/10 bg-white/[0.04] text-slate-300";
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

function LabMetric({ label, value, sub, tone = "cold" }: { label: string; value: string | number; sub: string; tone?: ReadinessTone }) {
  return (
    <div className={`rounded-[1.2rem] border p-4 ${toneClasses(tone)}`}>
      <div className="text-[9px] font-black uppercase tracking-[0.18em] opacity-70">{label}</div>
      <div className="mt-2 font-display text-3xl font-black tracking-[-0.05em] text-white">{value}</div>
      <div className="mt-1 text-[11px] leading-4 opacity-75">{sub}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-2 py-2 text-center">
      <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-1 font-display text-lg font-black text-white">{value}</div>
    </div>
  );
}

function ProductRail({ cards }: { cards: UfcCardSummary[] }) {
  const featured = cards.filter(isFeaturedCard);
  const fightCount = featured.reduce((sum, card) => sum + card.fightCount, 0);
  const simulatedFightCount = featured.reduce((sum, card) => sum + card.simulatedFightCount, 0);
  const pendingCount = Math.max(0, fightCount - simulatedFightCount);
  const resolvedShadowCount = cards.reduce((sum, card) => sum + card.shadowResolvedCount, 0);
  const targetCard = nextDisplayCard(featured);
  const tone = readinessTone({ fightCount, simulatedFightCount, pendingSimCount: pendingCount });
  const lastSim = latestSim(cards);

  return (
    <section className="rounded-[1.5rem] border border-aqua/15 bg-[radial-gradient(circle_at_top_right,rgba(0,210,255,0.14),transparent_18rem),rgba(255,255,255,0.035)] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.28)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-aqua">MMA Fight Lab</div>
          <h2 className="mt-1 font-display text-3xl font-black tracking-[-0.06em] text-white">Featured fight simulation surface</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Featured MMA cards exclude cold-start D-grade research cards. Those stay available below in Research Lab until fighter profiles, market odds, and source cross-checks improve.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/sim" className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-300">Sim hub</Link>
          {targetCard ? (
            <Link href={`/sim/ufc/cards/${targetCard.eventId}`} className="rounded-full border border-aqua/30 bg-aqua/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-aqua">Open featured card</Link>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <LabMetric label="Featured cards" value={featured.length} sub={targetCard ? `Target: ${targetCard.eventLabel}` : `${cards.length} research cards hidden from featured`} tone={featured.length ? tone : "cold"} />
        <LabMetric label="Featured fights" value={fightCount} sub={`${pendingCount} pending simulation`} tone={fightCount ? tone : "cold"} />
        <LabMetric label="Sim coverage" value={pct(simulatedFightCount, fightCount)} sub={`${simulatedFightCount}/${fightCount} featured fights simulated`} tone={tone} />
        <LabMetric label="Shadow review" value={resolvedShadowCount} sub={`Last sim: ${dateLabel(lastSim)}`} tone={resolvedShadowCount ? "ready" : tone} />
      </div>
    </section>
  );
}

function trustScore(status: UfcPipelineStatus) {
  if (!status.ok) return 0;
  const fightTotal = status.upcomingFightCount;
  const featurePct = fightTotal ? (status.featureReadyFightCount / fightTotal) * 100 : 0;
  const simPct = fightTotal ? (status.simulatedFightCount / fightTotal) * 100 : 0;
  let score = 20;
  if (status.upcomingEventCount > 0) score += 15;
  if (fightTotal > 0) score += 15;
  score += Math.min(25, Math.round(featurePct * 0.25));
  score += Math.min(25, Math.round(simPct * 0.25));
  if (status.missingFeaturePairCount > 0) score -= Math.min(15, status.missingFeaturePairCount * 2);
  return Math.max(0, Math.min(100, score));
}

function gateTone(score: number, status: UfcPipelineStatus): ReadinessTone {
  if (!status.ok || score < 45) return "cold";
  if (score < 80 || status.pendingSimCount > 0 || status.missingFeaturePairCount > 0) return "warn";
  return "ready";
}

function GateRow({ label, detail, pass }: { label: string; detail: string; pass: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 p-3">
      <div>
        <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{label}</div>
        <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
      </div>
      <span className={pill(pass ? "green" : "amber")}>{pass ? "pass" : "watch"}</span>
    </div>
  );
}

function TrustGate({ status }: { status: UfcPipelineStatus }) {
  const score = trustScore(status);
  const tone = gateTone(score, status);
  const featurePct = status.upcomingFightCount ? (status.featureReadyFightCount / status.upcomingFightCount) * 100 : 0;
  const simPct = status.upcomingFightCount ? (status.simulatedFightCount / status.upcomingFightCount) * 100 : 0;
  const trustLabel = tone === "ready" ? "actionable lab" : tone === "warn" ? "partial trust" : "not ready";

  return (
    <section className={`rounded-[1.35rem] border p-4 shadow-[0_24px_90px_rgba(0,0,0,0.24)] ${toneClasses(tone)}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">Fight Lab trust gate</div>
          <h2 className="mt-1 font-display text-2xl font-black tracking-[-0.05em] text-white">{trustLabel}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 opacity-80">
            This panel decides whether the UFC board should be treated as a real decision surface or only a pipeline/debug view. A+ product behavior means showing the user when the model is not ready.
          </p>
        </div>
        <div className="rounded-[1.15rem] border border-white/10 bg-black/25 px-4 py-3 text-right">
          <div className="text-[9px] font-black uppercase tracking-[0.16em] opacity-70">Trust score</div>
          <div className="font-display text-4xl font-black tracking-[-0.06em] text-white">{score}</div>
        </div>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <GateRow label="Schema health" detail={status.ok ? "Database query and UFC tables are responding." : status.errors[0] ?? "Pipeline status query failed."} pass={status.ok} />
        <GateRow label="Card inventory" detail={`${status.upcomingEventCount} upcoming events and ${status.upcomingFightCount} upcoming fights loaded.`} pass={status.upcomingEventCount > 0 && status.upcomingFightCount > 0} />
        <GateRow label="Feature coverage" detail={`${pctValue(featurePct)} of upcoming fights have both fighter feature snapshots.`} pass={featurePct >= 80} />
        <GateRow label="Simulation coverage" detail={`${pctValue(simPct)} of upcoming fights have cached SharkSim predictions.`} pass={simPct >= 80 && status.pendingSimCount === 0} />
      </div>
    </section>
  );
}

function ProductChecklist() {
  const items = [
    ["Fight cards", "Upcoming UFC and MVP cards must be loaded before the lab can show value."],
    ["Feature hydration", "Each fighter needs feature pairs before the strongest model output is available."],
    ["SharkSim output", "Method, round, edge, and path summaries come from cached UFC predictions."],
    ["Source audit", "Card detail pages show provider agreement and source quality before trusting a pick."]
  ] as const;

  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {items.map(([title, text]) => (
        <div key={title} className="rounded-[1.2rem] border border-white/10 bg-white/[0.035] p-4">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-aqua">{title}</div>
          <p className="mt-2 text-sm leading-6 text-slate-400">{text}</p>
        </div>
      ))}
    </section>
  );
}

function DiscoveryPanel({ discovery }: { discovery: MmaCardDiscoveryResult | null }) {
  if (!discovery || discovery.cards.length === 0) return null;
  const loadHref = "/api/admin/ufc/load-upcoming?confirm=load-upcoming&includeMvp=1&includeEspn=0&includeTapology=0&includeUfcCom=0&autoBuildFeatures=1&hydrate=1&limit=40&horizonDays=180";
  const simHref = `${loadHref}&simulate=1&allowFallbackFeatures=1&simulations=25000`;

  return (
    <section className="rounded-[1.35rem] border border-amber-300/20 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.12),transparent_18rem),rgba(255,255,255,0.04)] p-4 shadow-[0_24px_90px_rgba(0,0,0,0.24)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-200">Official cards detected</div>
          <h2 className="mt-1 font-display text-2xl font-black tracking-[-0.05em] text-white">MVP/UFC cards are available but not loaded into SharkSim yet</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            This panel reads official promotion inventory directly so upcoming MMA cards are not buried when the warehouse is empty. Load cards to write them into the fight warehouse, then simulate when features are ready.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={loadHref} className="rounded-full border border-aqua/30 bg-aqua/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-aqua">Load cards</a>
          <a href={simHref} className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-amber-200">Load + 25k sim</a>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {discovery.cards.map((card) => (
          <a key={`${card.promotionKey}:${card.sourceKey}`} href={card.sourceUrl ?? loadHref} className="rounded-[1.2rem] border border-white/10 bg-black/20 p-4 transition hover:border-amber-300/35">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-200">{dateLabel(card.eventDate)}</div>
                <div className="mt-1 font-display text-2xl font-black tracking-[-0.04em] text-white">{card.eventName}</div>
              </div>
              <span className={pill(card.promotionKey === "mvp" ? "amber" : "aqua")}>{card.promotionName ?? card.promotionKey ?? "MMA"}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className={pill("slate")}>{card.combatSport ?? "MMA"}</span>
              <span className={pill("slate")}>{card.fightCount} fights</span>
              <span className={pill("slate")}>{card.sourceStatus ?? "official"}</span>
            </div>
            {card.location ? <div className="mt-3 text-xs leading-5 text-slate-500">{card.location}</div> : null}
          </a>
        ))}
      </div>
      {discovery.warnings.length || discovery.errors.length ? (
        <div className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-300/10 p-3 text-xs leading-5 text-amber-100">
          {[...discovery.warnings, ...discovery.errors].slice(0, 3).map((message) => <p key={message}>{message}</p>)}
        </div>
      ) : null}
    </section>
  );
}

function CardGrid({ cards, emptyText }: { cards: UfcCardSummary[]; emptyText: string }) {
  if (!cards.length) {
    return <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.035] p-4 text-sm leading-6 text-slate-400">{emptyText}</div>;
  }
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => {
        const complete = card.fightCount > 0 && card.simulatedFightCount >= card.fightCount;
        const partial = card.simulatedFightCount > 0 && !complete;
        const coldResearch = card.dataQualityGrade === "D";
        return (
          <Link key={card.eventId} href={`/sim/ufc/cards/${card.eventId}`} className="rounded-[1.25rem] border border-white/10 bg-[#06101b]/80 p-4 transition hover:border-aqua/35 hover:bg-aqua/[0.045]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-aqua">{dateLabel(card.eventDate)}</div>
                <div className="mt-1 font-display text-2xl font-black tracking-[-0.04em] text-white">{card.eventLabel}</div>
              </div>
              <span className={pill(coldResearch ? "red" : complete ? "green" : partial ? "amber" : card.providerStatus.includes("linked") ? "aqua" : "slate")}>
                {coldResearch ? "research only" : complete ? "sim ready" : partial ? "partial" : card.providerStatus}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className={pill(card.promotionKey === "mvp" ? "amber" : "aqua")}>{card.promotionName ?? "UFC"}</span>
              <span className={pill("slate")}>{card.combatSport ?? "MMA"}</span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <MiniStat label="Fights" value={card.fightCount} />
              <MiniStat label="Sims" value={card.simulatedFightCount} />
              <MiniStat label="Quality" value={card.dataQualityGrade ?? "Pending"} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className={pill("slate")}>{card.shadowPendingCount} pending</span>
              <span className={pill("slate")}>{card.shadowResolvedCount} resolved</span>
              <span className={pill(partial || complete ? "aqua" : "slate")}>{pct(card.simulatedFightCount, card.fightCount)} coverage</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function UfcLabCardGrid({ cards, discovery }: { cards: UfcCardSummary[]; discovery: MmaCardDiscoveryResult | null }) {
  if (!cards.length) {
    return (
      <section className="rounded-[1.35rem] border border-white/10 bg-white/[0.045] p-4 shadow-[0_24px_90px_rgba(0,0,0,0.24)]">
        <div className="text-sm leading-6 text-slate-400">
          No warehouse fight cards yet. {discovery?.cards.length ? "Use the official-card panel above to load the detected MVP/UFC inventory into SharkSim." : "Run"} <span className="font-black text-aqua">npm run worker:ufc:upcoming</span> to ingest upcoming card matchups, then run SharkSim when model features are ready.
        </div>
      </section>
    );
  }
  const featuredCards = cards.filter(isFeaturedCard);
  const researchCards = cards.filter((card) => !isFeaturedCard(card));

  return (
    <div className="grid gap-4">
      <section className="grid gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-aqua">Featured cards</div>
          <p className="mt-1 text-sm leading-6 text-slate-400">Only non-D cards with cached simulations appear here. Cold-start MVP/UFC cards stay in Research Lab until their profiles are hydrated.</p>
        </div>
        <CardGrid cards={featuredCards} emptyText="No featured MMA cards yet. Current cards are research-only because they are D-grade/cold-start, missing odds, or not sufficiently hydrated." />
      </section>
      <section className="grid gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-200">Research Lab</div>
          <p className="mt-1 text-sm leading-6 text-slate-400">All loaded cards remain available here for inspection, source audit, fighter-profile debugging, and no-market-edge research.</p>
        </div>
        <CardGrid cards={researchCards} emptyText="No research-only cards. Everything currently meets featured-card minimums." />
      </section>
    </div>
  );
}

export default async function UfcFightLabPage() {
  const [cards, status] = await Promise.all([getUfcCards({ includePast: true }), getUfcPipelineStatus()]);
  const discovery = cards.length ? null : await discoverOfficialMmaCards({ timeoutMs: 5000, maxEvents: 3 });

  return (
    <main className="min-h-screen bg-[#02060b] px-3 py-4 text-white sm:px-5">
      <div className="mx-auto grid max-w-7xl gap-4">
        <SharkFightsHeader
          title="MMA Fight Lab"
          subtitle="The SharkEdge fight-sim workspace: UFC and MVP fight cards, style matchups, method probabilities, fight-path reasoning, source audits, and pipeline readiness."
        />
        <ProductRail cards={cards} />
        <TrustGate status={status} />
        <UfcPipelineStatusPanel status={status} />
        <DiscoveryPanel discovery={discovery} />
        <ProductChecklist />
        <UfcLabCardGrid cards={cards} discovery={discovery} />
      </div>
    </main>
  );
}
import Link from "next/link";
import type { ReactNode } from "react";

import {
  readSimCache,
  SIM_CACHE_KEYS,
  type SimHubSnapshot,
  type SimMarketSnapshot,
  type SimPrioritySnapshot,
  type SimRefreshStatusSnapshot
} from "@/services/simulation/sim-snapshot-service";
import {
  buildSimCardViewModels,
  type SimCardViewModel,
  type ActionView
} from "@/services/simulation/build-sim-card-view-model";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

const DISPLAY_TIME_ZONE = "America/Chicago";
const ACTIONS = ["bets", "totals", "all", "attack", "play", "lean", "watch", "pass"] as const;
type ActionFilter = (typeof ACTIONS)[number];
type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

// ── Helpers ──────────────────────────────────────────────────────────────────

function param(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

function dateFrom(value: string | null | undefined) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function chicagoKeyFromDate(date: Date) {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: DISPLAY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  return `${p.find((x) => x.type === "year")?.value ?? "0000"}-${p.find((x) => x.type === "month")?.value ?? "00"}-${p.find((x) => x.type === "day")?.value ?? "00"}`;
}

function chicagoKey(value: string | null | undefined) {
  const d = dateFrom(value);
  return d ? chicagoKeyFromDate(d) : "unknown";
}

function relativeKey(offsetDays: number) {
  return chicagoKeyFromDate(new Date(Date.now() + offsetDays * 86_400_000));
}

function dateLabel(key: string) {
  if (key === "all") return "All dates";
  if (key === relativeKey(-1)) return "Yesterday";
  if (key === relativeKey(0)) return "Today";
  if (key === relativeKey(1)) return "Tomorrow";
  const [yr, mo, dy] = key.split("-").map(Number);
  if (!yr || !mo || !dy) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(new Date(Date.UTC(yr, mo - 1, dy, 12)));
}

function ageMinutes(value: string | null | undefined) {
  const d = dateFrom(value);
  return d ? Math.max(0, Math.floor((Date.now() - d.getTime()) / 60_000)) : null;
}

function age(value: string | null | undefined) {
  const m = ageMinutes(value);
  if (m == null) return "unknown";
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}h ${r}m ago` : `${h}h ago`;
}

function gameTime(value: string | null | undefined) {
  const d = dateFrom(value);
  if (!d) return "TBD";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: DISPLAY_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(d);
}

function pct(v: number | null | undefined, digits = 1) {
  return typeof v === "number" && Number.isFinite(v)
    ? `${(v * 100).toFixed(digits)}%`
    : "—";
}

function signedPct(v: number | null | undefined, digits = 1) {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  const s = v * 100;
  return `${s > 0 ? "+" : ""}${s.toFixed(digits)}%`;
}

function fmtOdds(v: number | null | undefined) {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  const r = Math.round(v);
  return r > 0 ? `+${r}` : String(r);
}

function isBetAction(action: string) {
  return action === "ATTACK" || action === "PLAY";
}

function shouldShow(vm: SimCardViewModel, filter: ActionFilter) {
  if (filter === "all") return true;
  if (filter === "totals") return vm.hasTotals;
  if (filter === "bets") return isBetAction(vm.primaryAction.action);
  return vm.primaryAction.action.toLowerCase() === filter;
}

function filterHref(date: string, action: ActionFilter) {
  return `/sim-fast?date=${encodeURIComponent(date)}&action=${action}`;
}

// ── Verdict config ───────────────────────────────────────────────────────────

type VerdictKey = "ATTACK" | "PLAY" | "LEAN" | "WATCH" | "PASS" | "NO_MARKET";

const VC: Record<VerdictKey, {
  label: string;
  sub: string;
  card: string;
  glow: string;
  badge: string;
  badgeText: string;
  strip: string;
  verdict: string;
  verdictText: string;
}> = {
  ATTACK: {
    label: "STRONG BET",
    sub: "High-confidence edge found",
    card: "border-emerald-400/20",
    glow: "shadow-[0_0_60px_rgba(52,211,153,0.14)]",
    badge: "border-emerald-400/35 bg-emerald-400/12",
    badgeText: "text-emerald-200",
    strip: "bg-emerald-400",
    verdict: "border-emerald-400/15 bg-emerald-950/50",
    verdictText: "text-emerald-200",
  },
  PLAY: {
    label: "BET",
    sub: "Positive expected value",
    card: "border-cyan-400/18",
    glow: "shadow-[0_0_50px_rgba(34,211,238,0.11)]",
    badge: "border-cyan-400/30 bg-cyan-400/10",
    badgeText: "text-cyan-200",
    strip: "bg-cyan-400",
    verdict: "border-cyan-400/15 bg-cyan-950/40",
    verdictText: "text-cyan-200",
  },
  LEAN: {
    label: "LEAN",
    sub: "Slight model advantage",
    card: "border-sky-400/14",
    glow: "",
    badge: "border-sky-400/25 bg-sky-400/8",
    badgeText: "text-sky-300",
    strip: "bg-sky-400",
    verdict: "border-sky-400/12 bg-sky-950/30",
    verdictText: "text-sky-200",
  },
  WATCH: {
    label: "WATCH",
    sub: "Marginal or no edge",
    card: "border-amber-400/12",
    glow: "",
    badge: "border-amber-400/20 bg-amber-400/[0.07]",
    badgeText: "text-amber-300",
    strip: "bg-amber-400",
    verdict: "border-amber-400/10 bg-amber-950/25",
    verdictText: "text-amber-200",
  },
  PASS: {
    label: "PASS",
    sub: "No betting edge",
    card: "border-white/[0.07]",
    glow: "",
    badge: "border-white/12 bg-white/[0.03]",
    badgeText: "text-slate-500",
    strip: "bg-slate-600",
    verdict: "border-white/[0.05] bg-slate-950/50",
    verdictText: "text-slate-400",
  },
  NO_MARKET: {
    label: "NO ODDS",
    sub: "Sportsbook data unavailable",
    card: "border-amber-400/12",
    glow: "",
    badge: "border-amber-400/20 bg-amber-400/[0.07]",
    badgeText: "text-amber-300",
    strip: "bg-amber-500",
    verdict: "border-amber-400/10 bg-amber-950/25",
    verdictText: "text-amber-200",
  },
};

function vcKey(action: string): VerdictKey {
  return (["ATTACK", "PLAY", "LEAN", "WATCH", "PASS", "NO_MARKET"].includes(action)
    ? action
    : "PASS") as VerdictKey;
}

// ── Base components ──────────────────────────────────────────────────────────

function Badge({ children, className }: { children: ReactNode; className: string }) {
  return (
    <span className={`rounded-md border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] ${className}`}>
      {children}
    </span>
  );
}

function VerdictBadge({ action }: { action: string }) {
  const k = vcKey(action);
  const c = VC[k];
  return <Badge className={`${c.badge} ${c.badgeText}`}>{c.label}</Badge>;
}

function ButtonLink({ href, active, children }: { href: string; active?: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={`rounded-xl border px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition-colors ${
        active
          ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-200"
          : "border-white/10 bg-white/[0.03] text-slate-500 hover:border-white/18 hover:text-slate-300"
      }`}
    >
      {children}
    </Link>
  );
}

function StatusTile({ label, value, sub, ok = true }: {
  label: string; value: string | number; sub: string; ok?: boolean;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${ok ? "border-white/[0.07] bg-white/[0.02]" : "border-amber-400/15 bg-amber-400/[0.04]"}`}>
      <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-600">{label}</div>
      <div className="mt-2 font-mono text-2xl font-bold text-white">{value}</div>
      <div className="mt-1 text-[10px] leading-4 text-slate-600">{sub}</div>
    </div>
  );
}

function DataCell({ label, value, sub, ok = true }: {
  label: string; value: ReactNode; sub?: string; ok?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-3 ${ok ? "border-white/[0.06] bg-white/[0.015]" : "border-amber-400/15 bg-amber-400/[0.04]"}`}>
      <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-700">{label}</div>
      <div className="mt-1 font-mono text-base font-bold text-white">{value}</div>
      {sub ? <div className="mt-0.5 text-[10px] leading-4 text-slate-600">{sub}</div> : null}
    </div>
  );
}

// ── Win probability bar ──────────────────────────────────────────────────────

function ProbBar({ awayTeam, homeTeam, awayProb, homeProb, awayMkt, homeMkt, betSide }: {
  awayTeam: string;
  homeTeam: string;
  awayProb: number;
  homeProb: number;
  awayMkt?: number | null;
  homeMkt?: number | null;
  betSide?: "home" | "away" | null;
}) {
  const total = awayProb + homeProb;
  const aPct = total > 0 ? (awayProb / total) * 100 : 50;
  const hPct = 100 - aPct;
  const awayFav = aPct >= hPct;

  return (
    <div>
      <div className="mb-2 flex items-end justify-between">
        <div>
          <div className={`text-xs font-semibold leading-tight ${awayFav ? "text-white" : "text-slate-500"}`}>
            {awayTeam}
            {betSide === "away" ? <span className="ml-1.5 text-[9px] text-cyan-400">← BET</span> : null}
          </div>
          <div className={`mt-0.5 font-mono text-2xl font-bold tabular-nums ${awayFav ? "text-cyan-300" : "text-slate-500"}`}>
            {aPct.toFixed(1)}%
          </div>
          {awayMkt != null ? (
            <div className="text-[9px] text-slate-700">
              {(awayMkt * 100).toFixed(1)}% market
            </div>
          ) : null}
        </div>

        <div className="px-3 text-center">
          <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-slate-700">Win prob</div>
        </div>

        <div className="text-right">
          <div className={`text-xs font-semibold leading-tight ${!awayFav ? "text-white" : "text-slate-500"}`}>
            {homeTeam}
            {betSide === "home" ? <span className="ml-1.5 text-[9px] text-violet-400">BET →</span> : null}
          </div>
          <div className={`mt-0.5 font-mono text-2xl font-bold tabular-nums ${!awayFav ? "text-violet-300" : "text-slate-500"}`}>
            {hPct.toFixed(1)}%
          </div>
          {homeMkt != null ? (
            <div className="text-[9px] text-slate-700">
              {(homeMkt * 100).toFixed(1)}% market
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex h-3 overflow-hidden rounded-full bg-slate-800/80">
        <div
          style={{ width: `${aPct}%` }}
          className="bg-gradient-to-r from-cyan-500 to-cyan-400 transition-all duration-500"
        />
        <div
          style={{ width: `${hPct}%` }}
          className="bg-gradient-to-r from-violet-500 to-violet-400 transition-all duration-500"
        />
      </div>
      <div className="mt-1 flex justify-between text-[8px] font-medium uppercase tracking-[0.18em] text-slate-700">
        <span>Away</span>
        <span>Home</span>
      </div>
    </div>
  );
}

// ── Score prediction ─────────────────────────────────────────────────────────

function ScorePrediction({ vm }: { vm: SimCardViewModel }) {
  const { projectedAwayRuns: away, projectedHomeRuns: home, projectedTotal, marketTotal } = vm;
  const awayWins = (away ?? 0) > (home ?? 0);

  return (
    <div className="rounded-xl border border-white/[0.06] bg-black/20 px-4 py-3">
      <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.2em] text-slate-700">Model score projection</div>
      <div className="flex items-center justify-between">
        <div>
          <div className={`text-[10px] font-semibold ${awayWins ? "text-slate-300" : "text-slate-600"}`}>{vm.awayTeam}</div>
          <div className={`font-mono text-3xl font-bold tabular-nums ${awayWins ? "text-cyan-300" : "text-slate-600"}`}>
            {away?.toFixed(1) ?? "—"}
          </div>
        </div>
        <div className="text-center">
          <div className="font-mono text-xs text-slate-700">vs</div>
          {projectedTotal != null ? (
            <div className="mt-1 text-[9px] text-slate-700">
              Proj {projectedTotal.toFixed(1)}
              {marketTotal != null ? ` · Line ${marketTotal.toFixed(1)}` : ""}
            </div>
          ) : null}
        </div>
        <div className="text-right">
          <div className={`text-[10px] font-semibold ${!awayWins ? "text-slate-300" : "text-slate-600"}`}>{vm.homeTeam}</div>
          <div className={`font-mono text-3xl font-bold tabular-nums ${!awayWins ? "text-violet-300" : "text-slate-600"}`}>
            {home?.toFixed(1) ?? "—"}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Moneyline panel ──────────────────────────────────────────────────────────

function MoneylinePanel({ view, vm }: { view: ActionView; vm: SimCardViewModel }) {
  const k = vcKey(view.action);
  const c = VC[k];
  const teamLabel =
    view.side === "home" ? vm.homeTeam
    : view.side === "away" ? vm.awayTeam
    : "—";

  return (
    <div className={`rounded-2xl border p-4 ${c.verdict}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-600">Moneyline</span>
        <VerdictBadge action={view.action} />
      </div>
      <div className={`text-sm font-semibold ${c.verdictText}`}>{teamLabel}</div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <DataCell label="Odds" value={fmtOdds(view.odds)} sub={view.sportsbook ?? "market"} />
        <DataCell
          label="EV"
          value={signedPct(view.ev)}
          ok={(view.ev ?? -1) >= 0}
        />
        <DataCell
          label="Model prob"
          value={pct(view.modelProbability)}
          sub={`Mkt ${pct(view.marketProbability)}`}
        />
        <DataCell
          label="Edge"
          value={signedPct(view.probabilityEdge)}
          ok={(view.probabilityEdge ?? -1) >= 0}
        />
      </div>
      {view.stakeUnits > 0 ? (
        <div className={`mt-3 rounded-xl border px-3 py-2 text-center ${c.badge}`}>
          <span className={`text-xs font-bold ${c.badgeText}`}>
            Bet {view.stakeUnits.toFixed(2)} units · ¼-Kelly sizing
          </span>
        </div>
      ) : null}
    </div>
  );
}

// ── Totals panel ─────────────────────────────────────────────────────────────

function TotalsPanel({ view, vm }: { view: ActionView; vm: SimCardViewModel }) {
  const k = vcKey(view.action);
  const c = VC[k];
  const direction = view.side === "over" ? "OVER" : "UNDER";
  const runEdge = typeof view.projectedRunEdge === "number" && Number.isFinite(view.projectedRunEdge)
    ? view.projectedRunEdge
    : null;
  const runSign = runEdge != null ? (runEdge > 0 ? "+" : "") : "";

  return (
    <div className={`rounded-2xl border p-4 ${c.verdict}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-600">Over / Under</span>
        <div className="flex items-center gap-1.5">
          <Badge className={`${c.badge} ${c.badgeText}`}>{direction}</Badge>
          <VerdictBadge action={view.action} />
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-2xl font-bold text-white">{vm.marketTotal?.toFixed(1) ?? "—"}</span>
        <span className="text-xs text-slate-600">line</span>
        {vm.projectedTotal != null ? (
          <span className={`text-sm font-semibold tabular-nums ${
            runEdge != null && runEdge > 0
              ? "text-emerald-400"
              : runEdge != null && runEdge < 0
              ? "text-red-400"
              : "text-slate-500"
          }`}>
            → proj {vm.projectedTotal.toFixed(1)}
            {runEdge != null ? ` (${runSign}${runEdge.toFixed(1)})` : ""}
          </span>
        ) : null}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <DataCell label="EV" value={signedPct(view.ev)} ok={(view.ev ?? -1) >= 0} />
        <DataCell label="Odds" value={fmtOdds(view.odds)} sub={view.sportsbook ?? "market"} />
        <DataCell
          label="Model prob"
          value={pct(view.modelProbability)}
          sub={`Mkt ${pct(view.marketProbability)}`}
        />
        <DataCell
          label="Run edge"
          value={runEdge != null ? `${runSign}${runEdge.toFixed(2)}` : "—"}
        />
      </div>
      {view.stakeUnits > 0 ? (
        <div className={`mt-3 rounded-xl border px-3 py-2 text-center ${c.badge}`}>
          <span className={`text-xs font-bold ${c.badgeText}`}>
            Bet {view.stakeUnits.toFixed(2)} units · ¼-Kelly sizing
          </span>
        </div>
      ) : null}
    </div>
  );
}

// ── Reasons / warning chips ───────────────────────────────────────────────────

function ReasonChips({ view }: { view: ActionView }) {
  const all = view.reasons.length + view.warnings.length + view.hardStops.length;
  if (all === 0) return null;

  return (
    <div className="space-y-2">
      {view.reasons.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {view.reasons.map((r, i) => (
            <span key={i} className="rounded-md bg-white/[0.04] px-2 py-0.5 text-[10px] text-slate-500">{r}</span>
          ))}
        </div>
      ) : null}
      {view.warnings.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {view.warnings.map((w, i) => (
            <span key={i} className="rounded-md border border-amber-400/15 bg-amber-400/[0.05] px-2 py-0.5 text-[10px] text-amber-400">{w}</span>
          ))}
        </div>
      ) : null}
      {view.hardStops.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {view.hardStops.map((s, i) => (
            <span key={i} className="rounded-md border border-red-400/20 bg-red-400/[0.06] px-2 py-0.5 text-[10px] text-red-300">⛔ {s}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ── Verdict strip ────────────────────────────────────────────────────────────

function VerdictStrip({ vm }: { vm: SimCardViewModel }) {
  const primary = vm.primaryAction;
  const k = vcKey(primary.action);
  const c = VC[k];
  const isBet = isBetAction(primary.action);
  const teamLabel =
    primary.side === "home" ? vm.homeTeam
    : primary.side === "away" ? vm.awayTeam
    : null;

  return (
    <div className={`rounded-2xl border px-5 py-4 ${c.verdict}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-slate-600">Model verdict</div>
          <div className={`mt-1 text-xl font-bold ${c.verdictText}`}>
            {c.label}
            {teamLabel && isBet ? <span className="ml-2 text-sm font-normal opacity-70">— {teamLabel}</span> : null}
          </div>
          <div className="mt-0.5 text-xs text-slate-600">{c.sub}</div>
        </div>
        <div className="flex items-center gap-3">
          {vm.confidence != null ? (
            <div className="text-right">
              <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-700">Confidence</div>
              <div className={`mt-0.5 font-mono text-lg font-bold tabular-nums ${
                vm.confidence >= 0.7 ? "text-emerald-400"
                : vm.confidence >= 0.5 ? "text-amber-400"
                : "text-slate-600"
              }`}>{pct(vm.confidence)}</div>
            </div>
          ) : null}
          {primary.actionScore != null ? (
            <div className="text-right">
              <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-700">Score</div>
              <div className="mt-0.5 font-mono text-lg font-bold tabular-nums text-white">{primary.actionScore}</div>
            </div>
          ) : null}
        </div>
      </div>
      {(primary.reasons.length + primary.warnings.length + primary.hardStops.length) > 0 ? (
        <div className="mt-3 pt-3 border-t border-white/[0.05]">
          <ReasonChips view={primary} />
        </div>
      ) : null}
    </div>
  );
}

// ── Game cards ────────────────────────────────────────────────────────────────

function ProjectionCard({ vm }: { vm: SimCardViewModel }) {
  const isAwayLean = vm.lean.team === vm.awayTeam;
  const awayProb = isAwayLean ? vm.lean.pct : 1 - vm.lean.pct;
  const homeProb = isAwayLean ? 1 - vm.lean.pct : vm.lean.pct;
  const hasScore = vm.projectedAwayRuns != null || vm.projectedHomeRuns != null;

  return (
    <article className="overflow-hidden rounded-[1.5rem] border border-white/[0.07] bg-slate-950/60">
      {/* Header */}
      <div className="border-b border-white/[0.05] px-5 pb-4 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge className="border-white/10 bg-white/[0.04] text-slate-500">{vm.leagueKey}</Badge>
            <Badge className="border-amber-400/20 bg-amber-400/[0.07] text-amber-300">Projection only</Badge>
          </div>
          <Link
            href={vm.href}
            className="shrink-0 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:border-white/20 hover:text-white"
          >
            View →
          </Link>
        </div>
        <h3 className="mt-3 text-xl font-semibold text-white">
          <span className="text-slate-400">{vm.awayTeam}</span>
          <span className="mx-2 text-slate-800">@</span>
          <span className="text-white">{vm.homeTeam}</span>
        </h3>
        <div className="mt-0.5 text-xs text-slate-700">{gameTime(vm.startTime)} · {vm.status ?? "scheduled"}</div>
      </div>

      {/* Body */}
      <div className="space-y-4 p-5">
        <ProbBar
          awayTeam={vm.awayTeam}
          homeTeam={vm.homeTeam}
          awayProb={awayProb}
          homeProb={homeProb}
        />
        {hasScore ? <ScorePrediction vm={vm} /> : null}
        <div className="rounded-xl border border-amber-400/12 bg-amber-950/20 px-4 py-3 text-xs leading-5 text-amber-400/60">
          Sportsbook lines not yet joined — win probabilities and score projections are available but no EV, odds, or stake sizing until the odds feed refreshes.
        </div>
      </div>
    </article>
  );
}

function BettingCard({ vm }: { vm: SimCardViewModel }) {
  const primary = vm.primaryAction;
  const totals = vm.totalsView;
  const k = vcKey(primary.action);
  const c = VC[k];
  const hasScore = vm.projectedAwayRuns != null || vm.projectedHomeRuns != null;

  // Reconstruct per-team probabilities
  let awayProb = 0.5, homeProb = 0.5;
  let awayMkt: number | null = null, homeMkt: number | null = null;

  if (primary.modelProbability != null) {
    if (primary.side === "away") {
      awayProb = primary.modelProbability;
      homeProb = 1 - primary.modelProbability;
    } else if (primary.side === "home") {
      homeProb = primary.modelProbability;
      awayProb = 1 - primary.modelProbability;
    } else {
      const isAwayLean = vm.lean.team === vm.awayTeam;
      awayProb = isAwayLean ? vm.lean.pct : 1 - vm.lean.pct;
      homeProb = isAwayLean ? 1 - vm.lean.pct : vm.lean.pct;
    }
  } else {
    const isAwayLean = vm.lean.team === vm.awayTeam;
    awayProb = isAwayLean ? vm.lean.pct : 1 - vm.lean.pct;
    homeProb = isAwayLean ? 1 - vm.lean.pct : vm.lean.pct;
  }

  if (primary.marketProbability != null) {
    if (primary.side === "away") {
      awayMkt = primary.marketProbability;
      homeMkt = 1 - primary.marketProbability;
    } else if (primary.side === "home") {
      homeMkt = primary.marketProbability;
      awayMkt = 1 - primary.marketProbability;
    }
  }

  return (
    <article className={`overflow-hidden rounded-[1.5rem] border bg-slate-950/70 ${c.card} ${c.glow}`}>
      {/* Verdict accent strip */}
      <div className={`h-0.5 w-full ${c.strip} opacity-60`} />

      {/* Header */}
      <div className="border-b border-white/[0.04] px-5 pb-4 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge className="border-white/10 bg-white/[0.04] text-slate-500">{vm.leagueKey}</Badge>
            <VerdictBadge action={primary.action} />
            {vm.hasTotals && totals ? (
              <Badge className="border-white/10 bg-white/[0.03] text-slate-600">O/U available</Badge>
            ) : null}
          </div>
          <Link
            href={vm.href}
            className="shrink-0 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:border-white/20 hover:text-white"
          >
            View →
          </Link>
        </div>
        <h3 className="mt-3 text-xl font-semibold">
          <span className={primary.side === "away" ? "font-bold text-cyan-200" : "text-slate-400"}>
            {vm.awayTeam}
          </span>
          <span className="mx-2 text-slate-800">@</span>
          <span className={primary.side === "home" ? "font-bold text-violet-200" : "text-white"}>
            {vm.homeTeam}
          </span>
        </h3>
        <div className="mt-0.5 text-xs text-slate-700">{gameTime(vm.startTime)} · {vm.status ?? "scheduled"}</div>
      </div>

      {/* Win probability */}
      <div className="border-b border-white/[0.04] px-5 py-4">
        <ProbBar
          awayTeam={vm.awayTeam}
          homeTeam={vm.homeTeam}
          awayProb={awayProb}
          homeProb={homeProb}
          awayMkt={awayMkt}
          homeMkt={homeMkt}
          betSide={primary.side === "home" || primary.side === "away" ? primary.side : null}
        />
      </div>

      {/* Market panels */}
      <div className={`border-b border-white/[0.04] p-5 ${vm.hasTotals && totals ? "grid gap-4 xl:grid-cols-2" : ""}`}>
        <MoneylinePanel view={primary} vm={vm} />
        {vm.hasTotals && totals ? <TotalsPanel view={totals} vm={vm} /> : null}
      </div>

      {/* Score prediction */}
      {hasScore ? (
        <div className="border-b border-white/[0.04] px-5 py-4">
          <ScorePrediction vm={vm} />
        </div>
      ) : null}

      {/* Verdict */}
      <div className="p-5">
        <VerdictStrip vm={vm} />
      </div>
    </article>
  );
}

function GameCard({ vm }: { vm: SimCardViewModel }) {
  if (vm.mode === "projection_only") return <ProjectionCard vm={vm} />;
  return <BettingCard vm={vm} />;
}

// ── Snapshot loading ──────────────────────────────────────────────────────────

async function readSnapshots() {
  const [hub, priority, market, status] = await Promise.all([
    readSimCache<SimHubSnapshot>(SIM_CACHE_KEYS.hub).catch(() => null),
    readSimCache<SimPrioritySnapshot>(SIM_CACHE_KEYS.priority).catch(() => null),
    readSimCache<SimMarketSnapshot>(SIM_CACHE_KEYS.market).catch(() => null),
    readSimCache<SimRefreshStatusSnapshot>(SIM_CACHE_KEYS.refreshStatus).catch(() => null)
  ]);
  return { hub, priority, market, status };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function FastSimHubPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const selectedDate =
    param(resolved, "date") === "all" ? "all" : param(resolved, "date") || relativeKey(0);
  const rawAction = String(param(resolved, "action") ?? "all").toLowerCase();
  const actionFilter = (ACTIONS as readonly string[]).includes(rawAction)
    ? (rawAction as ActionFilter)
    : "all";

  const { hub, priority, market, status } = await readSnapshots();

  const rows = priority?.rows ?? [];
  const marketEdges = (market?.edges ?? []) as NonNullable<SimMarketSnapshot["edges"]>;
  const allModels = buildSimCardViewModels(rows, marketEdges);

  const availableDates = [
    ...new Set(allModels.map((vm) => chicagoKey(vm.startTime)).filter((k) => k !== "unknown"))
  ].sort();

  const dateModels =
    selectedDate === "all"
      ? allModels
      : allModels.filter((vm) => chicagoKey(vm.startTime) === selectedDate);

  const cards = dateModels.filter((vm) => shouldShow(vm, actionFilter));

  const attackCount = dateModels.filter((vm) => vm.primaryAction.action === "ATTACK").length;
  const playCount = dateModels.filter((vm) => vm.primaryAction.action === "PLAY").length;
  const betCount = attackCount + playCount;
  const totalsCount = dateModels.filter((vm) => vm.hasTotals).length;
  const marketJoinedCount = dateModels.filter((vm) => vm.mode === "betting").length;

  const simAge = status?.lastSuccessAt ?? priority?.generatedAt ?? hub?.generatedAt ?? null;
  const simFresh = (ageMinutes(simAge) ?? 999) <= 20;
  const hasMarket = Boolean(market?.lineCount && market.lineCount > 0 && marketJoinedCount > 0);

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      {/* ── Hero ── */}
      <section className="rounded-[1.75rem] border border-cyan-400/10 bg-slate-950/90 p-6 shadow-[0_0_80px_rgba(14,165,233,0.06)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.3em] text-cyan-400/70">
              MLB Simulation Hub
            </div>
            <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-white">
              SharkEdge Sim Hub
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
              {hasMarket
                ? `${betCount > 0 ? `${betCount} bet${betCount === 1 ? "" : "s"} · ` : ""}${totalsCount} O/U · ${marketJoinedCount} market-joined games`
                : "Projection-only slate · no sportsbook lines joined"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/api/sim/refresh?force=1&wait=1"
              className="rounded-xl border border-cyan-400/22 bg-cyan-400/8 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-300 transition-colors hover:bg-cyan-400/14"
            >
              ↺ Refresh
            </Link>
            <Link
              href="/api/odds/health"
              className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 transition-colors hover:text-white"
            >
              Odds Health
            </Link>
            <Link
              href="/api/sim/debug"
              className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 transition-colors hover:text-white"
            >
              Debug
            </Link>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <StatusTile
            label="Best bets"
            value={hasMarket ? betCount : 0}
            sub={hasMarket ? `${attackCount} strong · ${playCount} play` : "Odds required"}
            ok={hasMarket && betCount > 0}
          />
          <StatusTile
            label="O/U edges"
            value={hasMarket ? totalsCount : 0}
            sub="Priced over/under games"
            ok={hasMarket && totalsCount > 0}
          />
          <StatusTile
            label="Slate"
            value={dateModels.length}
            sub={hasMarket ? `${marketJoinedCount} with market` : "Projection only"}
            ok={dateModels.length > 0}
          />
          <StatusTile
            label="Projections"
            value={simFresh ? "Fresh" : allModels.length > 0 ? "Stale" : "None"}
            sub={`Updated ${age(simAge)}`}
            ok={simFresh && allModels.length > 0}
          />
          <StatusTile
            label="Odds feed"
            value={hasMarket ? "Live" : "None"}
            sub={hasMarket ? age(market?.generatedAt) : "No lines joined"}
            ok={hasMarket}
          />
          <StatusTile
            label="Sportsbook lines"
            value={market?.lineCount ?? 0}
            sub={`${hub?.summary?.mlbCount ?? priority?.summary?.mlbCount ?? marketEdges.length} MLB games`}
            ok={hasMarket}
          />
        </div>
      </section>

      {/* ── No odds warning ── */}
      {!hasMarket ? (
        <section className="rounded-[1.5rem] border border-amber-400/15 bg-amber-950/25 p-5">
          <div className="text-[9px] font-bold uppercase tracking-[0.26em] text-amber-400/70">
            Odds feed unavailable
          </div>
          <h2 className="mt-2 text-2xl font-bold text-white">Projection-only slate</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            No betting analysis until sportsbook lines are ingested. Win probabilities and score projections are shown but EV, odds, and stake sizing require live lines.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] text-slate-600">
            <span className="rounded-md bg-white/[0.04] px-2 py-1">Lines: {market?.lineCount ?? 0}</span>
            <span className="rounded-md bg-white/[0.04] px-2 py-1">Edges: {marketEdges.length}</span>
            {status?.reason ? <span className="rounded-md bg-white/[0.04] px-2 py-1">{status.reason}</span> : null}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/api/sim/refresh?force=1&wait=1"
              className="rounded-xl border border-cyan-400/22 bg-cyan-400/8 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-300"
            >
              ↺ Refresh now
            </Link>
            <Link
              href="/api/odds/health"
              className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400"
            >
              Odds Health
            </Link>
          </div>
        </section>
      ) : null}

      {/* ── Filters ── */}
      <section className="rounded-[1.5rem] border border-white/[0.07] bg-slate-950/70 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.26em] text-cyan-400/70">Filter</div>
            <h2 className="mt-1 text-2xl font-bold text-white">{dateLabel(selectedDate)}</h2>
            <div className="mt-0.5 text-[10px] text-slate-700">
              {cards.length} showing · {dateModels.length} total
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={filterHref(relativeKey(-1), actionFilter)} active={selectedDate === relativeKey(-1)}>Yesterday</ButtonLink>
            <ButtonLink href={filterHref(relativeKey(0), actionFilter)} active={selectedDate === relativeKey(0)}>Today</ButtonLink>
            <ButtonLink href={filterHref(relativeKey(1), actionFilter)} active={selectedDate === relativeKey(1)}>Tomorrow</ButtonLink>
            <ButtonLink href={filterHref("all", actionFilter)} active={selectedDate === "all"}>All dates</ButtonLink>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {ACTIONS.map((value) => (
            <ButtonLink key={value} href={filterHref(selectedDate, value)} active={actionFilter === value}>
              {value}
            </ButtonLink>
          ))}
        </div>

        <form method="get" className="mt-4 flex flex-wrap items-end gap-3">
          <input type="hidden" name="action" value={actionFilter} />
          <label className="grid gap-1">
            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-700">
              Specific date
            </span>
            <input
              type="date"
              name="date"
              defaultValue={selectedDate === "all" ? relativeKey(0) : selectedDate}
              className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-cyan-400/30 focus:outline-none"
            />
          </label>
          <button
            type="submit"
            className="rounded-xl border border-cyan-400/20 bg-cyan-400/8 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-300"
          >
            Apply
          </button>
          {availableDates.length > 0 ? (
            <span className="self-end text-[10px] text-slate-700">
              {availableDates.map(dateLabel).join(" · ")}
            </span>
          ) : null}
        </form>
      </section>

      {/* ── Cards ── */}
      {cards.length === 0 ? (
        <section className="rounded-[1.5rem] border border-white/[0.07] bg-slate-950/70 p-8 text-center">
          <div className="text-[9px] font-bold uppercase tracking-[0.26em] text-slate-700">No results</div>
          <h2 className="mt-2 text-2xl font-bold text-white">No cards match this filter</h2>
          <p className="mt-2 text-sm text-slate-600">
            {allModels.length} total · {marketJoinedCount} market-joined · {market?.lineCount ?? 0} lines
            {status?.reason ? ` · ${status.reason}` : ""}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link
              href={filterHref(selectedDate, "all")}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400"
            >
              View all
            </Link>
            <Link
              href="/api/sim/refresh?force=1&wait=1"
              className="rounded-xl border border-cyan-400/22 bg-cyan-400/8 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-300"
            >
              ↺ Refresh sim
            </Link>
          </div>
        </section>
      ) : (
        <section className="grid gap-4 2xl:grid-cols-2">
          {cards.map((vm) => (
            <GameCard key={vm.gameId} vm={vm} />
          ))}
        </section>
      )}
    </main>
  );
}

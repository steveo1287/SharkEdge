import Link from "next/link";

import { getMlbIntelV7AccuracyProof } from "@/services/simulation/mlb-intel-v7-accuracy-adapter";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type LedgerView = {
  total: number;
  settled: number;
  pending: number;
  wins: number;
  losses: number;
  settleRate: number | null;
  winRate: number | null;
  brier: number | null;
  logLoss: number | null;
  clv: number | null;
  roi?: number | null;
};

type AccuracyRulesView = {
  gradedRowsOnly: boolean;
  pendingExcludedFromWinRate: boolean;
  pendingExcludedFromRoi: boolean;
  historicalV6Preserved: boolean;
};

const EMPTY_LEDGER: LedgerView = {
  total: 0,
  settled: 0,
  pending: 0,
  wins: 0,
  losses: 0,
  settleRate: null,
  winRate: null,
  brier: null,
  logLoss: null,
  clv: null,
  roi: null
};

const DEFAULT_RULES: AccuracyRulesView = {
  gradedRowsOnly: true,
  pendingExcludedFromWinRate: true,
  pendingExcludedFromRoi: true,
  historicalV6Preserved: true
};

function readValue(searchParams: Record<string, string | string[] | undefined>, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function readWindowDays(value: string | undefined) {
  const parsed = Number(value ?? 90);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(3650, Math.round(parsed))) : 90;
}

function pct(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${(value * 100).toFixed(digits)}%`;
}

function num(value: number | null | undefined, digits = 4) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return value.toFixed(digits);
}

function rawPct(value: number | null | undefined, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function Tile({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 font-mono text-2xl font-bold text-white">{value}</div>
      <div className="mt-2 text-xs leading-5 text-slate-400">{note}</div>
    </div>
  );
}

function LedgerCard({ title, subtitle, ledger, official = false }: { title: string; subtitle: string; ledger: LedgerView; official?: boolean }) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">{title}</div>
          <h2 className="mt-1 text-xl font-semibold text-white">mlb-intel-v7</h2>
          <p className="mt-1 text-sm leading-6 text-slate-400">{subtitle}</p>
        </div>
        <div className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100">
          {ledger.settled > 0 ? "Grading" : ledger.pending > 0 ? "Capturing" : "Waiting"}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Tile label="Total" value={ledger.total} note="Captured V7 rows" />
        <Tile label="Settled" value={ledger.settled} note="Finals graded" />
        <Tile label="Pending" value={ledger.pending} note="Excluded from accuracy" />
        <Tile label="Record" value={`${ledger.wins}-${ledger.losses}`} note="Pushes excluded" />
        <Tile label="Win rate" value={pct(ledger.winRate)} note="Settled rows only" />
        <Tile label="Settle rate" value={pct(ledger.settleRate)} note="Settled / total" />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Brier" value={num(ledger.brier)} note="Lower is better" />
        <Tile label="Log loss" value={num(ledger.logLoss)} note="Overconfidence penalty" />
        <Tile label="CLV" value={rawPct(ledger.clv)} note="Market-to-close proof" />
        <Tile label="ROI" value={official ? rawPct(ledger.roi) : "--"} note={official ? "Official picks only" : "Snapshots are calibration rows"} />
      </div>
    </section>
  );
}

export default async function MlbIntelV7AccuracyPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const requestedWindowDays = readWindowDays(readValue(resolved, "windowDays"));
  const proof = await getMlbIntelV7AccuracyProof(requestedWindowDays);

  if (!proof.ok) {
    return (
      <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
        <section className="rounded-[1.75rem] border border-red-400/20 bg-slate-950/80 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-red-200">MLB Intel V7 Accuracy</div>
          <h1 className="mt-2 font-display text-3xl font-semibold text-white">V7 accuracy proof is not ready.</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{proof.error ?? "The MLB Intel V7 ledger summary could not be loaded."}</p>
          <div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.14em]">
            <Link href="/sim/accuracy" className="text-cyan-200 hover:text-cyan-100">Accuracy page</Link>
            <Link href="/api/sim/mlb-intel-v7/accuracy-proof" className="text-cyan-200 hover:text-cyan-100">Proof JSON</Link>
          </div>
        </section>
      </main>
    );
  }

  const status = proof.status ?? "unknown";
  const windowDays = proof.windowDays ?? requestedWindowDays;
  const warnings = proof.warnings ?? [];
  const snapshotLedger = proof.snapshotLedger ?? EMPTY_LEDGER;
  const officialPickLedger = proof.officialPickLedger ?? EMPTY_LEDGER;
  const accuracyRules = proof.accuracyRules ?? DEFAULT_RULES;

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/80 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">MLB Intel V7 Accuracy Proof</div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">Current V7 capture and grading state</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Direct proof from the MLB V7 ledgers. Pending rows are shown, but only settled rows count toward win rate, Brier, log loss, CLV, and ROI.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.14em]">
            <Link href="/sim/accuracy" className="text-cyan-200 hover:text-cyan-100">Full accuracy</Link>
            <Link href={`/api/sim/accuracy?action=v7-proof&windowDays=${windowDays}`} className="text-cyan-200 hover:text-cyan-100">API JSON</Link>
            <Link href="/sim/mlb/v7/live" className="text-cyan-200 hover:text-cyan-100">Live V7 board</Link>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Tile label="Status" value={status} note="V7 ledger state" />
          <Tile label="Window" value={`${windowDays}d`} note="Reporting range" />
          <Tile label="Source" value="2" note="V7 ledger tables" />
          <Tile label="Pending rule" value="Excluded" note="Win rate / ROI" />
          <Tile label="History" value="V6 kept" note="No row rewrites" />
        </div>
      </section>

      {warnings.length ? (
        <section className="grid gap-2 rounded-[1.5rem] border border-amber-300/20 bg-amber-300/[0.06] p-4 text-sm leading-6 text-amber-100">
          {warnings.map((warning) => <div key={warning}>{warning}</div>)}
        </section>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-2">
        <LedgerCard
          title="Snapshot Ledger"
          subtitle="All current V7 model snapshots captured for calibration."
          ledger={snapshotLedger}
        />
        <LedgerCard
          title="Official Pick Ledger"
          subtitle="Released V7 official picks. ROI belongs here, not the snapshot ledger."
          ledger={officialPickLedger}
          official
        />
      </div>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5">
        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Accuracy rules</div>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <Tile label="Graded rows only" value={accuracyRules.gradedRowsOnly ? "Yes" : "No"} note="Accuracy source" />
          <Tile label="Pending win rate" value={accuracyRules.pendingExcludedFromWinRate ? "Excluded" : "Included"} note="No fake records" />
          <Tile label="Pending ROI" value={accuracyRules.pendingExcludedFromRoi ? "Excluded" : "Included"} note="No open-row ROI" />
          <Tile label="V6 history" value={accuracyRules.historicalV6Preserved ? "Preserved" : "Modified"} note="Historical rows remain" />
        </div>
      </section>
    </main>
  );
}

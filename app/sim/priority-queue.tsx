"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { SimDecisionBadge, SimStatusBadge, SimTableShell } from "@/components/sim/sim-ui";
import { EmptyState } from "@/components/ui/empty-state";
import { formatLongDate } from "@/lib/formatters/date";

type PriorityRow = {
  id: string;
  leagueKey: "NBA" | "MLB";
  status: string;
  startTime: string;
  matchup: { away: string; home: string };
  lean: { team: string; pct: number; edge: number };
  tier: string;
  confidence: number | null;
  homeEdge: number | null;
  edgeMatched: boolean;
  href: string;
};

type PriorityPayload = {
  ok: boolean;
  generatedAt: string;
  rows: PriorityRow[];
  summary: {
    gameCount: number;
    rowCount: number;
    nbaCount: number;
    mlbCount: number;
    matchedMlbLines: number;
  };
  reason?: string;
};

function pct(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${(value * 100).toFixed(digits)}%`;
}

function plus(value: number | null | undefined, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function PrioritySkeleton() {
  return (
    <SimTableShell title="Priority queue" description="Loading the live queue after the page shell renders.">
      <div className="grid gap-2 p-4">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-14 animate-pulse rounded-xl border border-white/10 bg-white/[0.035]" />
        ))}
      </div>
    </SimTableShell>
  );
}

function PriorityError({ reason, onRetry }: { reason?: string; onRetry: () => void }) {
  return (
    <SimTableShell title="Priority queue" description="The hub is still usable. The live queue failed independently.">
      <div className="p-4">
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/[0.07] p-4">
          <div className="text-sm font-semibold text-amber-100">Priority queue unavailable</div>
          <div className="mt-2 text-xs leading-5 text-amber-100/75">
            {reason || "A provider or model call took too long. Open the NBA or MLB workspace directly while this recovers."}
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 rounded-full border border-amber-300/30 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-amber-100"
          >
            Retry queue
          </button>
        </div>
      </div>
    </SimTableShell>
  );
}

export function SimPriorityQueue() {
  const [payload, setPayload] = useState<PriorityPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const timer = setTimeout(() => controller.abort(), 10000);
    fetch("/api/sim/priority?limit=10", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok && response.status !== 206) {
          throw new Error(body?.reason || `Priority request failed with ${response.status}`);
        }
        setPayload(body);
        if (!body.ok) setError(body.reason || "Priority queue returned a fallback response.");
      })
      .catch((err) => {
        setPayload(null);
        setError(err instanceof Error ? err.message : "Priority queue failed.");
      })
      .finally(() => {
        clearTimeout(timer);
        setLoading(false);
      });

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [reloadKey]);

  if (loading && !payload) return <PrioritySkeleton />;
  if (error && !payload?.rows?.length) return <PriorityError reason={error} onRetry={() => setReloadKey((value) => value + 1)} />;

  const rows = payload?.rows ?? [];
  if (!rows.length) {
    return <EmptyState title="No NBA or MLB sims available" description="The fast hub loaded. The priority endpoint did not find an active NBA/MLB slate right now." />;
  }

  return (
    <SimTableShell
      title="Priority queue"
      description="Loaded after first paint with a hard timeout, so slow feeds cannot freeze the hub."
      right={error ? <span className="text-[10px] uppercase tracking-[0.14em] text-amber-200">Fallback</span> : <span className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{payload ? formatLongDate(payload.generatedAt) : ""}</span>}
    >
      <table className="min-w-full text-left text-xs">
        <thead className="border-b border-white/10 bg-white/[0.03] text-slate-400">
          <tr>
            <th className="px-3 py-2">Game</th>
            <th className="px-3 py-2">League</th>
            <th className="px-3 py-2">Lean</th>
            <th className="px-3 py-2 text-right">Win%</th>
            <th className="px-3 py-2 text-right">Edge</th>
            <th className="px-3 py-2 text-right">Conf.</th>
            <th className="px-3 py-2">Tier</th>
            <th className="px-3 py-2 text-right">Open</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.leagueKey}:${row.id}`} className="border-b border-white/5 last:border-none">
              <td className="px-3 py-3">
                <div className="font-semibold text-white">{row.matchup.away} @ {row.matchup.home}</div>
                <div className="mt-1 flex gap-2 text-[10px] text-slate-500"><span>{formatLongDate(row.startTime)}</span><SimStatusBadge status={row.status} /></div>
              </td>
              <td className="px-3 py-3 text-slate-300">{row.leagueKey}</td>
              <td className="px-3 py-3 text-slate-200">{row.lean.team}</td>
              <td className="px-3 py-3 text-right font-mono text-sky-200">{pct(row.lean.pct)}</td>
              <td className="px-3 py-3 text-right font-mono text-slate-200">{row.leagueKey === "MLB" ? plus(row.homeEdge) : pct(Math.abs(row.lean.edge), 1)}</td>
              <td className="px-3 py-3 text-right font-mono text-slate-200">{pct(row.confidence, 0)}</td>
              <td className="px-3 py-3"><SimDecisionBadge tier={row.tier} /></td>
              <td className="px-3 py-3 text-right"><Link href={row.href} className="rounded-full border border-sky-400/30 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-200">Open</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </SimTableShell>
  );
}

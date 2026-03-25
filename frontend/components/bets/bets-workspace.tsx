"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { BetForm } from "@/components/bets/bet-form";
import { BetTable } from "@/components/bets/bet-table";
import { SweatBoard } from "@/components/bets/sweat-board";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";
import { SetupStateCard } from "@/components/ui/setup-state-card";
import { StatCard } from "@/components/ui/stat-card";
import type {
  EventOption,
  LedgerBetFormInput,
  LedgerBetView,
  LedgerSetupState,
  SportsbookOption,
  SweatBoardItem
} from "@/lib/types/ledger";

type BetsWorkspaceProps = {
  summary: {
    record: string;
    roi: number;
    winRate: number;
    netUnits: number;
    openBets: number;
    trackedClvBets: number;
    averageClv: number | null;
    averageEv: number | null;
  };
  bets: LedgerBetView[];
  openBets: LedgerBetView[];
  settledBets: LedgerBetView[];
  sweatBoard: SweatBoardItem[];
  sportsbooks: SportsbookOption[];
  events: EventOption[];
  marketOptions: Array<{
    value: LedgerBetFormInput["legs"][number]["marketType"];
    label: string;
  }>;
  setup: LedgerSetupState | null;
  prefill: LedgerBetFormInput | null;
  liveNotes: string[];
};

function toFormValues(bet: LedgerBetView): LedgerBetFormInput {
  return {
    id: bet.id,
    placedAt: bet.placedAt.slice(0, 16),
    settledAt: bet.settledAt?.slice(0, 16) ?? null,
    source: bet.source,
    betType: bet.betType,
    sport: bet.sport,
    league: bet.league,
    eventId: bet.eventId,
    sportsbookId: bet.sportsbook?.id ?? null,
    status: bet.result,
    stake: bet.riskAmount,
    notes: bet.notes,
    tags: bet.tags.join(", "),
    isLive: bet.isLive,
    context: bet.context,
    legs: bet.legs.map((leg) => ({
      id: leg.id,
      eventId: leg.eventId,
      sportsbookId: leg.sportsbook?.id ?? null,
      marketType: leg.marketType,
      marketLabel: leg.marketLabel,
      selection: leg.selection,
      side: leg.side,
      line: leg.line,
      oddsAmerican: leg.oddsAmerican,
      closingLine: leg.closingLine,
      closingOddsAmerican: leg.closingOddsAmerican,
      notes: "",
      context: leg.context
    }))
  };
}

export function BetsWorkspace({
  summary,
  bets,
  openBets,
  settledBets,
  sweatBoard,
  sportsbooks,
  events,
  marketOptions,
  setup,
  prefill,
  liveNotes
}: BetsWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [editingBet, setEditingBet] = useState<LedgerBetFormInput | null>(prefill);
  const [feedback, setFeedback] = useState<string | null>(null);

  const initialFormValues = useMemo(() => editingBet ?? prefill, [editingBet, prefill]);

  function clearBetActionParams() {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("prefill");
    nextParams.delete("selection");
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
  }

  async function handleSubmit(values: LedgerBetFormInput) {
    setFeedback(null);
    const method = values.id ? "PATCH" : "POST";
    const url = values.id ? `/api/ledger/bets/${values.id}` : "/api/ledger/bets";

    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(values)
    });

    const payload = (await response.json()) as {
      error?: string;
    };

    if (!response.ok) {
      setFeedback(payload.error ?? "Unable to save bet.");
      return;
    }

    setEditingBet(null);
    startTransition(() => {
      clearBetActionParams();
      router.refresh();
    });
  }

  async function handleArchive(bet: LedgerBetView) {
    setFeedback(null);
    const response = await fetch(`/api/ledger/bets/${bet.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        archive: true
      })
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setFeedback(payload.error ?? "Unable to archive bet.");
      return;
    }

    startTransition(() => {
      router.refresh();
    });
  }

  async function handleQuickSettle(
    bet: LedgerBetView,
    result: Exclude<LedgerBetView["result"], "OPEN">
  ) {
    setFeedback(null);
    const response = await fetch(`/api/ledger/bets/${bet.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        settle: {
          result
        }
      })
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setFeedback(payload.error ?? "Unable to settle bet.");
      return;
    }

    startTransition(() => {
      router.refresh();
    });
  }

  async function handleDelete(bet: LedgerBetView) {
    setFeedback(null);
    const response = await fetch(`/api/ledger/bets/${bet.id}`, {
      method: "DELETE"
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setFeedback(payload.error ?? "Unable to delete bet.");
      return;
    }

    if (editingBet?.id === bet.id) {
      setEditingBet(null);
    }

    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <StatCard label="Record" value={summary.record} note="Settled bets only" />
        <StatCard label="Net Units" value={`${summary.netUnits > 0 ? "+" : ""}${summary.netUnits.toFixed(2)}u`} />
        <StatCard label="ROI" value={`${summary.roi > 0 ? "+" : ""}${summary.roi.toFixed(1)}%`} />
        <StatCard label="Win Rate" value={`${summary.winRate.toFixed(1)}%`} />
        <StatCard label="Open Bets" value={`${summary.openBets}`} />
        <StatCard
          label="Tracked CLV / EV"
          value={`${summary.trackedClvBets} / ${summary.averageEv === null ? "--" : `${summary.averageEv > 0 ? "+" : ""}${summary.averageEv.toFixed(2)}%`}`}
          note={
            summary.averageClv === null
              ? "CLV unavailable"
              : `Avg CLV ${summary.averageClv > 0 ? "+" : ""}${summary.averageClv.toFixed(2)}%`
          }
        />
      </div>

      {liveNotes.length ? (
        <div className="rounded-2xl border border-line bg-slate-950/55 px-4 py-3 text-sm text-slate-300">
          {liveNotes.join(" ")}
        </div>
      ) : null}

      <SectionTitle
        title="Sweat Board"
        description="Open tickets sync against live event state where the provider can support it. Unsupported or ambiguous markets stay neutral."
      />

      {sweatBoard.length ? (
        <SweatBoard
          items={sweatBoard}
          onQuickSettle={(betId, result) => {
            const target = bets.find((bet) => bet.id === betId);
            if (!target) {
              return Promise.resolve();
            }

            return handleQuickSettle(target, result);
          }}
        />
      ) : (
        <EmptyState
          title="No active bets to sweat"
          description="Once you log open tickets, their live state, event status, and leg outcomes will show up here."
        />
      )}

      {setup ? (
        <SetupStateCard title={setup.title} detail={setup.detail} steps={setup.steps} />
      ) : (
        <BetForm
          sportsbooks={sportsbooks}
          events={events}
          marketOptions={marketOptions}
          initialValues={initialFormValues}
          isSaving={isPending}
          onSubmit={handleSubmit}
          onCancelEdit={() => setEditingBet(null)}
        />
      )}

      {feedback ? (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {feedback}
        </div>
      ) : null}

      <SectionTitle
        title="Open Ledger"
        description="Active tickets stay editable until you settle or grade them."
      />

      {openBets.length ? (
        <BetTable
          bets={openBets}
          onEdit={(bet) => setEditingBet(toFormValues(bet))}
          onQuickSettle={handleQuickSettle}
          onArchive={handleArchive}
          onDelete={handleDelete}
        />
      ) : (
        <EmptyState
          title="No open bets"
          description="Use the ledger form above to add a straight bet or parlay. NBA, NCAAB, MLB, NHL, NFL, NCAAF, UFC, and boxing are all supported in the core model now."
        />
      )}

      <SectionTitle
        title="Settled Ledger"
        description="Closed tickets drive the performance numbers. CLV only shows where you captured both open and closing context honestly."
      />

      {settledBets.length ? (
        <BetTable
          bets={settledBets}
          onEdit={(bet) => setEditingBet(toFormValues(bet))}
          onQuickSettle={handleQuickSettle}
          onArchive={handleArchive}
          onDelete={handleDelete}
        />
      ) : (
        <EmptyState
          title="No settled bets yet"
          description="Once tickets close, they'll move here and flow directly into ROI, record, and segment analytics."
        />
      )}

      {!setup && !bets.length ? (
        <EmptyState
          title="Ledger is live but empty"
          description="The database is ready. Seed the starter card or add your first real bet to turn on the tracker and performance views."
        />
      ) : null}
    </div>
  );
}

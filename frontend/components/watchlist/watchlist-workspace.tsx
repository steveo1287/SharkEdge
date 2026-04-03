"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";

import { BetActionButton } from "@/components/bets/bet-action-button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SetupStateCard } from "@/components/ui/setup-state-card";
import { StatCard } from "@/components/ui/stat-card";
import type { AlertType, WatchlistItemView } from "@/lib/types/product";
import type { WatchlistPageData } from "@/lib/types/product";
import { formatAmericanOdds } from "@/lib/formatters/odds";

type WatchlistWorkspaceProps = Pick<WatchlistPageData, "items" | "summary" | "setup" | "plan">;

function formatAlertType(type: AlertType) {
  return type.replace(/_/g, " ").toLowerCase();
}

function defaultConfigForType(type: AlertType) {
  switch (type) {
    case "LINE_MOVEMENT_THRESHOLD":
    case "PROP_LINE_CHANGED":
      return { threshold: 1 };
    case "EV_THRESHOLD_REACHED":
    case "CLV_TREND":
      return { thresholdPct: 2 };
    case "STARTING_SOON":
      return { minutesBefore: 20 };
    case "TARGET_NUMBER_CROSSED":
      return { targetLine: 0 };
    default:
      return {};
  }
}

function CurrentStateBadge({ item }: { item: WatchlistItemView }) {
  if (!item.current.available) {
    return <Badge tone="muted">Adapter pending</Badge>;
  }

  if (item.current.eventStatus === "LIVE") {
    return <Badge tone="success">Live</Badge>;
  }

  if (item.current.eventStatus === "FINAL") {
    return <Badge tone="neutral">Final</Badge>;
  }

  return <Badge tone="brand">Watching</Badge>;
}

function WatchlistItemCard({
  item,
  onArchive,
  onRestore,
  onDelete,
  onCreateAlert,
  isPending,
  feedback
}: {
  item: WatchlistItemView;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  onCreateAlert: (item: WatchlistItemView, type: AlertType) => void;
  isPending: boolean;
  feedback: string | null;
}) {
  const [alertType, setAlertType] = useState<AlertType>("LINE_MOVEMENT_THRESHOLD");

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
            {item.league} | saved {new Date(item.savedAt).toLocaleString("en-US", {
              dateStyle: "short",
              timeStyle: "short"
            })}
          </div>
          <div className="mt-2 font-display text-2xl font-semibold text-white">
            {item.selection}
          </div>
          <div className="mt-2 text-sm text-slate-400">{item.eventLabel}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CurrentStateBadge item={item} />
          <Badge tone={item.supportStatus === "LIVE" ? "success" : item.supportStatus === "PARTIAL" ? "premium" : "muted"}>
            {item.supportStatus ?? "PARTIAL"}
          </Badge>
          <Badge tone="premium">{item.alertCount} alert{item.alertCount === 1 ? "" : "s"}</Badge>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-line bg-slate-950/65 p-4">
          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Saved</div>
          <div className="mt-2 text-lg font-medium text-white">
            {typeof item.line === "number" ? `${item.selection} ${item.line}` : item.selection}
          </div>
          <div className="mt-1 text-sm text-slate-400">
            {item.sportsbookName ?? "Book pending"} | {formatAmericanOdds(item.oddsAmerican)}
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-slate-950/65 p-4">
          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Current</div>
          <div className="mt-2 text-lg font-medium text-white">
            {item.current.available
              ? typeof item.current.line === "number"
                ? `${item.current.line}`
                : item.current.sportsbookName ?? "Available"
              : "Unavailable"}
          </div>
          <div className="mt-1 text-sm text-slate-400">
            {typeof item.current.oddsAmerican === "number"
              ? formatAmericanOdds(item.current.oddsAmerican)
              : item.current.note}
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-slate-950/65 p-4">
          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Start / State</div>
          <div className="mt-2 text-lg font-medium text-white">
            {item.current.eventStatus ?? "Pending"}
          </div>
          <div className="mt-1 text-sm text-slate-400">
            {item.current.startTime
              ? new Date(item.current.startTime).toLocaleString("en-US", {
                  dateStyle: "short",
                  timeStyle: "short"
                })
              : item.current.stateDetail ?? "Start time pending"}
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-slate-950/65 p-4">
          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Market EV</div>
          <div className="mt-2 text-lg font-medium text-white">
            {typeof item.current.expectedValuePct === "number"
              ? `${item.current.expectedValuePct > 0 ? "+" : ""}${item.current.expectedValuePct.toFixed(2)}%`
              : "Unavailable"}
          </div>
          <div className="mt-1 text-sm text-slate-400">
            {item.current.bestBookChanged
              ? "Best book has changed"
              : item.current.stale
                ? "Snapshot is stale"
                : "Watching live market state"}
          </div>
        </div>
      </div>

      <div className="mt-4 text-sm leading-7 text-slate-400">{item.current.note}</div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-3">
          {item.intent.matchupHref ? (
            <Link
              href={item.intent.matchupHref}
              className="rounded-2xl border border-line px-4 py-2 text-sm text-slate-300"
            >
              Open matchup
            </Link>
          ) : null}
          <BetActionButton intent={item.intent}>Add to slip</BetActionButton>
          <BetActionButton intent={item.intent} mode="log">
            Log now
          </BetActionButton>
        </div>
        <div className="flex flex-wrap gap-3">
          {item.status === "ACTIVE" ? (
            <button
              type="button"
              disabled={isPending}
              onClick={() => onArchive(item.id)}
              className="rounded-2xl border border-line px-4 py-2 text-sm text-slate-300"
            >
              Archive
            </button>
          ) : (
            <button
              type="button"
              disabled={isPending}
              onClick={() => onRestore(item.id)}
              className="rounded-2xl border border-line px-4 py-2 text-sm text-slate-300"
            >
              Restore
            </button>
          )}
          <button
            type="button"
            disabled={isPending}
            onClick={() => onDelete(item.id)}
            className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-200"
          >
            Remove
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 rounded-3xl border border-line bg-slate-950/55 p-4 md:grid-cols-[1fr_220px_auto]">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Create alert</div>
          <div className="mt-2 text-sm text-slate-400">
            In-app only this phase. SharkEdge evaluates these server-side against the saved play context and avoids duplicate spam.
          </div>
        </div>
        <select
          value={alertType}
          onChange={(event) => setAlertType(event.target.value as AlertType)}
          className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
        >
          <option value="LINE_MOVEMENT_THRESHOLD">Line movement</option>
          <option value="EV_THRESHOLD_REACHED">EV threshold</option>
          <option value="BEST_BOOK_CHANGED">Best book changed</option>
          <option value="STARTING_SOON">Starting soon</option>
          <option value="AVAILABILITY_RETURNED">Available again</option>
          <option value="TARGET_NUMBER_CROSSED">Target number</option>
          <option value="PROP_LINE_CHANGED">Props line changed</option>
          <option value="CLV_TREND">CLV trend</option>
        </select>
        <button
          type="button"
          disabled={isPending}
          onClick={() => onCreateAlert(item, alertType)}
          className="rounded-2xl border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-sm font-medium text-sky-300"
        >
          Create alert
        </button>
      </div>

      {feedback ? (
        <div className="mt-3 text-sm text-slate-400">{feedback}</div>
      ) : null}
    </Card>
  );
}

export function WatchlistWorkspace({
  items,
  summary,
  setup,
  plan
}: WatchlistWorkspaceProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);

  async function mutateWatchlist(id: string, action: "archive" | "restore" | "delete") {
    setFeedback(null);
    const response = await fetch(`/api/watchlist/items/${id}`, {
      method: action === "delete" ? "DELETE" : "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: action === "delete" ? undefined : JSON.stringify({ [action]: true })
    });

    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setFeedback(payload.error ?? "Watchlist action failed.");
      return;
    }

    startTransition(() => {
      router.refresh();
    });
  }

  async function handleCreateAlert(item: WatchlistItemView, type: AlertType) {
    setFeedback(null);
    const config = {
      type,
      ...defaultConfigForType(type)
    };

    const response = await fetch("/api/alerts/rules", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        watchlistItemId: item.id,
        type,
        name: `${formatAlertType(type)} | ${item.selection}`,
        config
      })
    });

    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setFeedback(payload.error ?? "Alert rule could not be created.");
      return;
    }

    setFeedback(`Alert saved for ${item.selection}.`);
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Saved Plays" value={`${summary.total}`} />
        <StatCard label="Live Watches" value={`${summary.live}`} />
        <StatCard label="Upcoming" value={`${summary.upcoming}`} />
        <StatCard label="Unavailable" value={`${summary.unavailable}`} note="Honest adapter gaps stay visible" />
        <StatCard
          label="Plan Limit"
          value={`${summary.total}/${plan.limits.watchlistItems}`}
          note={plan.isPremium ? "Premium watch volume" : "Free watch volume"}
        />
      </div>

      {setup ? (
        <SetupStateCard title={setup.title} detail={setup.detail} steps={setup.steps} />
      ) : null}

      {!setup && !items.length ? (
        <EmptyState
          title="No saved plays yet"
          description="Save a board side, prop, matchup signal, or top play and SharkEdge will keep the betting context attached for alerts, logging, and follow-up action."
        />
      ) : null}

      {items.map((item) => (
        <WatchlistItemCard
          key={item.id}
          item={item}
          isPending={isPending}
          feedback={feedback}
          onArchive={(id) => mutateWatchlist(id, "archive")}
          onRestore={(id) => mutateWatchlist(id, "restore")}
          onDelete={(id) => mutateWatchlist(id, "delete")}
          onCreateAlert={handleCreateAlert}
        />
      ))}
    </div>
  );
}

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
import type { AlertsPageData, AlertRuleView } from "@/lib/types/product";

type AlertCenterProps = AlertsPageData;

function getSeverityTone(severity: string) {
  if (severity === "CRITICAL") {
    return "danger" as const;
  }

  if (severity === "PREMIUM") {
    return "premium" as const;
  }

  if (severity === "ACTION") {
    return "brand" as const;
  }

  return "muted" as const;
}

function formatRuleConfig(rule: AlertRuleView) {
  if (rule.config.type === "LINE_MOVEMENT_THRESHOLD" || rule.config.type === "PROP_LINE_CHANGED") {
    return `Trigger at ${rule.config.threshold} pts`;
  }

  if (rule.config.type === "EV_THRESHOLD_REACHED" || rule.config.type === "CLV_TREND") {
    return `Trigger at ${rule.config.thresholdPct}%`;
  }

  if (rule.config.type === "STARTING_SOON") {
    return `${rule.config.minutesBefore} minutes before start`;
  }

  if (rule.config.type === "TARGET_NUMBER_CROSSED") {
    return `Target ${rule.config.targetLine}`;
  }

  if (rule.config.type === "BEST_BOOK_CHANGED") {
    return "Book rotation";
  }

  return "Availability watch";
}

export function AlertCenter({
  setup,
  notifications,
  rules,
  unreadCount,
  activeRuleCount,
  inAppOnly,
  plan
}: AlertCenterProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);

  async function patchNotification(id: string, body: { read?: boolean; dismiss?: boolean }) {
    setFeedback(null);
    const response = await fetch(`/api/alerts/notifications/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setFeedback(payload.error ?? "Notification update failed.");
      return;
    }

    startTransition(() => {
      router.refresh();
    });
  }

  async function patchRule(id: string, body: { status?: "ACTIVE" | "INACTIVE" | "MUTED"; mute?: boolean }) {
    setFeedback(null);
    const response = await fetch(`/api/alerts/rules/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setFeedback(payload.error ?? "Rule update failed.");
      return;
    }

    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Unread" value={`${unreadCount}`} />
        <StatCard label="Active Rules" value={`${activeRuleCount}`} />
        <StatCard label="Delivery" value={inAppOnly ? "In-app only" : "Mixed"} note="No fake push/email states" />
        <StatCard label="Plan" value={plan.statusLabel} />
        <StatCard
          label="Alert Limit"
          value={`${activeRuleCount}/${plan.limits.activeAlerts}`}
          note={plan.isPremium ? "Premium volume" : "Free volume"}
        />
      </div>

      {setup ? (
        <SetupStateCard title={setup.title} detail={setup.detail} steps={setup.steps} />
      ) : null}

      {feedback ? (
        <div className="rounded-2xl border border-line bg-slate-950/65 px-4 py-3 text-sm text-slate-300">
          {feedback}
        </div>
      ) : null}

      <Card className="p-5 text-sm leading-7 text-slate-400">
        SharkEdge evaluates alert rules server-side and writes them into the in-app alert center. Delivery is intentionally limited to in-app this phase, so there is no fake push or email promise.
      </Card>

      <section className="grid gap-4">
        {notifications.length ? (
          notifications.map((notification) => (
            <Card key={notification.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    {new Date(notification.createdAt).toLocaleString("en-US", {
                      dateStyle: "short",
                      timeStyle: "short"
                    })}
                  </div>
                  <div className="mt-2 font-display text-2xl font-semibold text-white">
                    {notification.title}
                  </div>
                  <div className="mt-2 text-sm leading-7 text-slate-400">{notification.body}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={getSeverityTone(notification.severity)}>{notification.severity}</Badge>
                  {notification.readAt ? <Badge tone="muted">Read</Badge> : <Badge tone="brand">Unread</Badge>}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                <div className="text-sm text-slate-400">
                  {[notification.eventLabel, notification.selection].filter(Boolean).join(" | ")}
                </div>
                <div className="flex flex-wrap gap-3">
                  {notification.sourcePath ? (
                    <Link
                      href={notification.sourcePath}
                      className="rounded-2xl border border-line px-4 py-2 text-sm text-slate-300"
                    >
                      Open source
                    </Link>
                  ) : null}
                  {notification.betIntent ? (
                    <BetActionButton intent={notification.betIntent}>Add to slip</BetActionButton>
                  ) : null}
                  {!notification.readAt ? (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => patchNotification(notification.id, { read: true })}
                      className="rounded-2xl border border-line px-4 py-2 text-sm text-slate-300"
                    >
                      Mark read
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => patchNotification(notification.id, { dismiss: true })}
                    className="rounded-2xl border border-line px-4 py-2 text-sm text-slate-300"
                  >
                    Dismiss
                  </button>
                  {notification.alertRuleId ? (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => patchRule(notification.alertRuleId!, { mute: true })}
                      className="rounded-2xl border border-amber-300/30 bg-amber-400/10 px-4 py-2 text-sm text-amber-200"
                    >
                      Mute similar
                    </button>
                  ) : null}
                </div>
              </div>
            </Card>
          ))
        ) : (
          <EmptyState
            title="No alert history yet"
            description="Save a play to the watchlist, create a rule, and SharkEdge will start logging in-app alerts here when the market or event state crosses a real trigger."
          />
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {rules.length ? (
          rules.map((rule) => (
            <Card key={rule.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{rule.league}</div>
                  <div className="mt-2 font-display text-2xl font-semibold text-white">{rule.name}</div>
                  <div className="mt-2 text-sm text-slate-400">
                    {[rule.marketLabel, rule.selection].filter(Boolean).join(" | ")}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge tone={rule.status === "ACTIVE" ? "success" : rule.status === "MUTED" ? "premium" : "muted"}>
                    {rule.status}
                  </Badge>
                  {rule.premiumRequired ? <Badge tone="premium">Premium</Badge> : null}
                </div>
              </div>
              <div className="mt-4 text-sm text-slate-300">{formatRuleConfig(rule)}</div>
              <div className="mt-2 text-sm text-slate-500">
                Last evaluated {rule.lastEvaluatedAt ? new Date(rule.lastEvaluatedAt).toLocaleString("en-US") : "pending"} | Last triggered {rule.lastTriggeredAt ? new Date(rule.lastTriggeredAt).toLocaleString("en-US") : "never"}
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                {rule.status !== "MUTED" ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => patchRule(rule.id, { mute: true })}
                    className="rounded-2xl border border-amber-300/30 bg-amber-400/10 px-4 py-2 text-sm text-amber-200"
                  >
                    Mute
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => patchRule(rule.id, { status: "ACTIVE" })}
                    className="rounded-2xl border border-line px-4 py-2 text-sm text-slate-300"
                  >
                    Reactivate
                  </button>
                )}
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => patchRule(rule.id, { status: "INACTIVE" })}
                  className="rounded-2xl border border-line px-4 py-2 text-sm text-slate-300"
                >
                  Disable
                </button>
              </div>
            </Card>
          ))
        ) : (
          <EmptyState
            title="No active rules yet"
            description="Create rules from saved plays in Watchlist and SharkEdge will evaluate them server-side against the live board and matchup mesh."
          />
        )}
      </section>
    </div>
  );
}

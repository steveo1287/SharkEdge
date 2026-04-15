"use client";

import { useState, useTransition } from "react";

import { Card } from "@/components/ui/card";
import { SetupStateCard } from "@/components/ui/setup-state-card";
import { StatCard } from "@/components/ui/stat-card";
import type { PreferencesPageData } from "@/lib/types/product";

type PreferencesPanelProps = PreferencesPageData;

export function PreferencesPanel({ setup, plan, preferences }: PreferencesPanelProps) {
  const [state, setState] = useState(preferences);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSave() {
    setFeedback(null);
    const response = await fetch("/api/preferences", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(state)
    });

    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setFeedback(payload.error ?? "Preferences could not be saved.");
      return;
    }

    startTransition(() => {
      setFeedback("Preferences saved.");
    });
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Plan" value={plan.statusLabel} />
        <StatCard label="Watchlist Limit" value={`${plan.limits.watchlistItems}`} />
        <StatCard label="Alert Limit" value={`${plan.limits.activeAlerts}`} />
        <StatCard label="Top Plays" value={`${plan.limits.topPlaysVisible}`} note="Visible before premium lock" />
      </div>

      {setup ? (
        <SetupStateCard title={setup.title} detail={setup.detail} steps={setup.steps} />
      ) : null}

      <Card className="p-5">
        <div className="font-display text-2xl font-semibold text-white">Plan Boundaries</div>
        <div className="mt-2 text-sm leading-7 text-slate-400">
          SharkEdge is plan-aware now. Subscription state is reflected in-app, but billing automation is not wired this phase, so entitlement changes stay intentionally explicit.
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-line bg-slate-950/65 p-4 text-sm text-slate-300">
            <div className="font-medium text-white">Free</div>
            <div className="mt-2 leading-6">
              Watchlist, in-app alerts, imports, and core ledger are live. Volume, advanced alerts, and deeper edge detail stay capped.
            </div>
          </div>
          <div className="rounded-2xl border border-amber-300/30 bg-amber-400/10 p-4 text-sm text-amber-100">
            <div className="font-medium">Premium</div>
            <div className="mt-2 leading-6">
              Full alert volume, advanced EV and best-book alerts, richer leak detail, and expanded Top Plays visibility.
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="font-display text-2xl font-semibold text-white">Notification Preferences</div>
        <div className="mt-2 text-sm leading-7 text-slate-400">
          In-app alerts only this phase. Quiet hours and sport-level toggles are real; SMS, push, and email are not implied.
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="rounded-2xl border border-line bg-slate-950/65 px-4 py-3 text-sm text-slate-300">
            <div className="font-medium text-white">Quiet hours</div>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="checkbox"
                checked={state.quietHours.enabled}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    quietHours: {
                      ...current.quietHours,
                      enabled: event.target.checked
                    }
                  }))
                }
                className="accent-sky-400"
              />
              Enable quiet hours
            </div>
          </label>
          <input
            type="number"
            value={state.quietHours.startHour}
            min={0}
            max={23}
            onChange={(event) =>
              setState((current) => ({
                ...current,
                quietHours: {
                  ...current.quietHours,
                  startHour: Number(event.target.value)
                }
              }))
            }
            className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
            placeholder="Quiet start"
          />
          <input
            type="number"
            value={state.quietHours.endHour}
            min={0}
            max={23}
            onChange={(event) =>
              setState((current) => ({
                ...current,
                quietHours: {
                  ...current.quietHours,
                  endHour: Number(event.target.value)
                }
              }))
            }
            className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
            placeholder="Quiet end"
          />
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-line bg-slate-950/65 p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Sports</div>
            <div className="mt-3 grid gap-2">
              {Object.entries(state.sportPreferences).map(([sport, enabled]) => (
                <label key={sport} className="flex items-center justify-between gap-3 text-sm text-slate-300">
                  <span>{sport}</span>
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(event) =>
                      setState((current) => ({
                        ...current,
                        sportPreferences: {
                          ...current.sportPreferences,
                          [sport]: event.target.checked
                        }
                      }))
                    }
                    className="accent-sky-400"
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-slate-950/65 p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Alert Types</div>
            <div className="mt-3 grid gap-2">
              {Object.entries(state.alertTypePreferences).map(([type, enabled]) => (
                <label key={type} className="flex items-center justify-between gap-3 text-sm text-slate-300">
                  <span>{type.replace(/_/g, " ")}</span>
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(event) =>
                      setState((current) => ({
                        ...current,
                        alertTypePreferences: {
                          ...current.alertTypePreferences,
                          [type]: event.target.checked
                        }
                      }))
                    }
                    className="accent-sky-400"
                  />
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          {feedback ? <div className="text-sm text-slate-300">{feedback}</div> : <div />}
          <button
            type="button"
            disabled={isPending}
            onClick={handleSave}
            className="rounded-2xl border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-sm font-medium text-sky-300"
          >
            Save preferences
          </button>
        </div>
      </Card>
    </div>
  );
}

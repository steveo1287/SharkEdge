"use client";

import { useEffect, useRef } from "react";

type SimHealthResponse = {
  ok?: boolean;
  sim?: { status?: string; freshness?: { ageMinutes?: number | null } };
  market?: { status?: string; lineCount?: number; freshness?: { ageMinutes?: number | null } };
  refresh?: { status?: string };
};

const STORAGE_KEY = "sharkedge:last-auto-sim-refresh";
const THROTTLE_MS = 20 * 60 * 1000;

function shouldRefresh(health: SimHealthResponse) {
  const simStatus = health.sim?.status ?? "missing";
  const marketStatus = health.market?.status ?? "missing";
  const lineCount = health.market?.lineCount ?? 0;
  const refreshStatus = health.refresh?.status ?? "missing";

  if (refreshStatus === "running") return false;
  if (simStatus !== "fresh") return true;
  if (marketStatus !== "fresh") return true;
  return lineCount <= 0;
}

function recentlyQueued() {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (!value) return false;
    return Date.now() - Number(value) < THROTTLE_MS;
  } catch {
    return false;
  }
}

function markQueued() {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    // Refresh throttling is best effort only.
  }
}

export function AutoRefreshOnStale({ enabled = true }: { enabled?: boolean; delayMs?: number }) {
  const queued = useRef(false);

  useEffect(() => {
    if (!enabled || queued.current) return;
    queued.current = true;

    async function run() {
      const healthResponse = await fetch("/api/sim/health", { cache: "no-store" });
      if (!healthResponse.ok) throw new Error(`health failed: ${healthResponse.status}`);
      const health = await healthResponse.json() as SimHealthResponse;

      if (!shouldRefresh(health) || recentlyQueued()) return;

      markQueued();

      // Queue the rebuild without blocking the page, showing an overlay, or
      // forcing a reload. Users can keep scrolling; the next manual refresh or
      // route visit will pick up the newer snapshot.
      const refreshResponse = await fetch("/api/sim/refresh?force=1&source=stale-sim-hub", { cache: "no-store" });
      if (!refreshResponse.ok && refreshResponse.status !== 202) {
        throw new Error(`refresh failed: ${refreshResponse.status}`);
      }
    }

    run().catch((error) => {
      console.error("[sim-hub] background stale refresh failed", error);
    });
  }, [enabled]);

  return null;
}

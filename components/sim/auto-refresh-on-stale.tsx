"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

type SimHealthResponse = {
  ok?: boolean;
  sim?: { status?: string; freshness?: { ageMinutes?: number | null } };
  market?: { status?: string; lineCount?: number; freshness?: { ageMinutes?: number | null } };
  refresh?: { status?: string };
};

const STORAGE_KEY = "sharkedge:last-auto-sim-refresh";
const THROTTLE_MS = 5 * 60 * 1000; // 5 min — tight enough to feel live

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
  } catch {}
}

export function AutoRefreshOnStale({ enabled = true }: { enabled?: boolean }) {
  const router = useRouter();
  const queued = useRef(false);

  useEffect(() => {
    if (!enabled || queued.current) return;
    queued.current = true;

    async function run() {
      const healthRes = await fetch("/api/sim/health", { cache: "no-store" });
      if (!healthRes.ok) throw new Error(`health failed: ${healthRes.status}`);
      const health = await healthRes.json() as SimHealthResponse;

      if (!shouldRefresh(health) || recentlyQueued()) return;

      markQueued();

      // Wait for the refresh to fully complete, then reload the RSC tree so
      // users see fresh data without touching anything.
      const refreshRes = await fetch("/api/sim/refresh?force=1&wait=1&source=stale-sim-hub", {
        cache: "no-store"
      });
      if (!refreshRes.ok && refreshRes.status !== 202) {
        throw new Error(`refresh failed: ${refreshRes.status}`);
      }

      router.refresh();
    }

    run().catch((error) => {
      console.error("[sim-hub] background stale refresh failed", error);
    });
  }, [enabled, router]);

  return null;
}

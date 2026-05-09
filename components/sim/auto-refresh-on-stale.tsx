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
const THROTTLE_MS = 5 * 60 * 1000;
const REFRESH_SETTLE_MS = 2500;

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
    const ts = Number(value);
    return Number.isFinite(ts) && Date.now() - ts < THROTTLE_MS;
  } catch {
    return false;
  }
}

function markQueued() {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {}
}

function logRefreshError(error: unknown) {
  if (process.env.NODE_ENV !== "production") {
    console.error("[sim-hub] background stale refresh failed", error);
  }
}

export function AutoRefreshOnStale({ enabled = true }: { enabled?: boolean }) {
  const router = useRouter();
  const queued = useRef(false);

  useEffect(() => {
    if (!enabled || queued.current) return;
    queued.current = true;
    const controller = new AbortController();

    async function run() {
      try {
        const healthRes = await fetch("/api/sim/health", {
          cache: "no-store",
          signal: controller.signal
        });
        if (!healthRes.ok) return;

        const health = await healthRes.json() as SimHealthResponse;
        if (!shouldRefresh(health) || recentlyQueued()) return;

        markQueued();

        // Do not wait on the expensive refresh path during page load. Queue it,
        // then refresh the RSC tree shortly after so the already-rendered shell
        // stays responsive on mobile.
        await fetch("/api/sim/refresh?force=1&wait=0&source=stale-sim-hub", {
          cache: "no-store",
          signal: controller.signal
        }).catch(() => null);

        window.setTimeout(() => {
          if (!controller.signal.aborted) router.refresh();
        }, REFRESH_SETTLE_MS);
      } catch (error) {
        if (!controller.signal.aborted) logRefreshError(error);
      }
    }

    void run();

    return () => controller.abort();
  }, [enabled, router]);

  return null;
}

"use client";

import { useEffect, useRef, useState } from "react";

type SimHealthResponse = {
  ok?: boolean;
  sim?: { status?: string; freshness?: { ageMinutes?: number | null } };
  market?: { status?: string; lineCount?: number; freshness?: { ageMinutes?: number | null } };
  refresh?: { status?: string };
};

const STORAGE_KEY = "sharkedge:last-auto-sim-refresh";
const THROTTLE_MS = 4 * 60 * 1000;

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
    // Ignore storage failures. Refresh protection is best effort.
  }
}

export function AutoRefreshOnStale({ enabled = true, delayMs = 5_000 }: { enabled?: boolean; delayMs?: number }) {
  const queued = useRef(false);
  const [status, setStatus] = useState<"idle" | "checking" | "queued" | "done" | "fresh" | "failed">("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || queued.current) return;
    queued.current = true;

    async function run() {
      setStatus("checking");

      const healthResponse = await fetch("/api/sim/health", { cache: "no-store" });
      if (!healthResponse.ok) throw new Error(`health failed: ${healthResponse.status}`);
      const health = await healthResponse.json() as SimHealthResponse;

      if (!shouldRefresh(health)) {
        setStatus("fresh");
        return;
      }

      if (recentlyQueued()) {
        setStatus("queued");
        setMessage("Refresh was already queued recently. Reloading shortly to check for a newer snapshot.");
        window.setTimeout(() => window.location.reload(), delayMs);
        return;
      }

      markQueued();
      setStatus("queued");
      setMessage("Sim or market cache is stale. Running a synchronous refresh now.");

      const refreshResponse = await fetch("/api/sim/refresh?force=1&wait=1&source=stale-sim-hub", { cache: "no-store" });
      if (!refreshResponse.ok && refreshResponse.status !== 207) {
        throw new Error(`refresh failed: ${refreshResponse.status}`);
      }

      setStatus("done");
      setMessage("Refresh completed. Reloading to show the newest sim snapshot.");
      window.setTimeout(() => window.location.reload(), delayMs);
    }

    run().catch((error) => {
      console.error("[sim-hub] stale auto refresh failed", error);
      setStatus("failed");
      setMessage("Auto refresh failed. Use Refresh Sim or open Health JSON to inspect the pipeline.");
    });
  }, [delayMs, enabled]);

  if (!enabled || status === "idle" || status === "fresh") return null;

  return (
    <div className="fixed inset-x-3 bottom-20 z-50 mx-auto max-w-3xl rounded-2xl border border-cyan-300/20 bg-slate-950/95 px-4 py-3 text-xs leading-5 text-cyan-100/90 shadow-[0_0_40px_rgba(34,211,238,0.16)] backdrop-blur">
      <span className="font-semibold uppercase tracking-[0.14em] text-cyan-200">Auto refresh</span>{" "}
      {message ?? (status === "checking" ? "Checking sim cache freshness." : "Refreshing sim cache.")}
    </div>
  );
}

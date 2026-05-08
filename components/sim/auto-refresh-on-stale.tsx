"use client";

import { useEffect, useRef, useState } from "react";

export function AutoRefreshOnStale({ enabled, delayMs = 18_000 }: { enabled: boolean; delayMs?: number }) {
  const queued = useRef(false);
  const [status, setStatus] = useState<"idle" | "queued" | "done" | "failed">("idle");

  useEffect(() => {
    if (!enabled || queued.current) return;
    queued.current = true;
    setStatus("queued");

    fetch("/api/sim/refresh?force=1&source=stale-sim-hub", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`refresh failed: ${response.status}`);
        setStatus("done");
        window.setTimeout(() => window.location.reload(), delayMs);
      })
      .catch((error) => {
        console.error("[sim-hub] stale auto refresh failed", error);
        setStatus("failed");
      });
  }, [delayMs, enabled]);

  if (!enabled) return null;

  return (
    <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] px-4 py-3 text-xs leading-5 text-cyan-100/90">
      <span className="font-semibold uppercase tracking-[0.14em] text-cyan-200">Auto refresh</span>{" "}
      {status === "queued" ? "Queued a background sim rebuild because the cache is stale." : null}
      {status === "done" ? "Refresh queued. This page will reload after the new snapshot has time to write." : null}
      {status === "failed" ? "Auto refresh failed. Use the Refresh Sim button or check /api/sim/health." : null}
      {status === "idle" ? "Checking stale sim cache." : null}
    </div>
  );
}

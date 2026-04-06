import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";
import type { GameHubView } from "@/lib/adapters/game-ui-adapter";

type GameMovementPanelProps = {
  movement: GameHubView["movement"];
};

function formatMovementNumber(value: number | null) {
  if (typeof value !== "number") {
    return "N/A";
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
}

export function GameMovementPanel({ movement }: GameMovementPanelProps) {
  const hasLineMovement = movement.lineMovement.length > 0;
  const hasRanges = movement.marketRanges.length > 0;

  if (!hasLineMovement && !hasRanges) {
    return (
      <EmptyState
        eyebrow="Movement"
        title="No line movement history is available yet"
        description="This matchup is still connected, but the current backend contract did not return movement history or market range context."
      />
    );
  }

  return (
    <div className="grid gap-4">
      <SectionTitle
        eyebrow="Movement"
        title="How the number has moved"
        description="Opening-to-current movement and current market range, without forcing a fake chart when the data is thin."
      />

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="surface-panel p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
              Provider state
            </div>
            <Badge
              tone={
                movement.providerHealth.state === "HEALTHY"
                  ? "success"
                  : movement.providerHealth.state === "DEGRADED"
                    ? "premium"
                    : movement.providerHealth.state === "OFFLINE"
                      ? "danger"
                      : "muted"
              }
            >
              {movement.providerHealth.label}
            </Badge>
          </div>

          <div className="mt-4 grid gap-3 text-sm leading-6 text-slate-300">
            <div className="rounded-[1.1rem] border border-white/8 bg-slate-950/60 px-4 py-3">
              {movement.providerHealth.summary}
            </div>

            {movement.providerHealth.asOf ? (
              <div className="rounded-[1.1rem] border border-white/8 bg-slate-950/60 px-4 py-3">
                Freshness: {movement.providerHealth.freshnessLabel.toLowerCase()}
              </div>
            ) : null}

            {movement.providerHealth.warnings.length ? (
              <div className="rounded-[1.1rem] border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-amber-100">
                {movement.providerHealth.warnings[0]}
              </div>
            ) : null}
          </div>
        </Card>

        <Card className="surface-panel p-5">
          <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
            Tracked snapshots
          </div>

          <div className="mt-4 overflow-hidden rounded-[1.15rem] border border-white/8">
            <div className="grid grid-cols-3 border-b border-white/8 bg-white/[0.03] px-4 py-3 text-[0.66rem] uppercase tracking-[0.2em] text-slate-500">
              <div>Captured</div>
              <div>Spread</div>
              <div>Total</div>
            </div>

            <div className="divide-y divide-white/8">
              {movement.lineMovement.slice(-8).reverse().map((point) => (
                <div
                  key={point.capturedAt}
                  className="grid grid-cols-3 px-4 py-3 text-sm text-slate-300"
                >
                  <div>{point.capturedAt.slice(0, 16).replace("T", " ")}</div>
                  <div>{formatMovementNumber(point.spreadLine)}</div>
                  <div>{formatMovementNumber(point.totalLine)}</div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {hasRanges ? (
        <Card className="surface-panel p-5">
          <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
            Market range
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {movement.marketRanges.map((range) => (
              <div
                key={`${range.label}-${range.value}`}
                className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-4"
              >
                <div className="text-[0.66rem] uppercase tracking-[0.2em] text-slate-500">
                  {range.label}
                </div>
                <div className="mt-2 text-lg font-semibold text-white">{range.value}</div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}


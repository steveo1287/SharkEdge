"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { LedgerBetResult, SweatBoardItem } from "@/lib/types/ledger";
import { formatUnits } from "@/lib/formatters/odds";
import { formatSyncAge } from "@/lib/utils/ledger";

function statusTone(status: SweatBoardItem["eventStatus"] | SweatBoardItem["result"]) {
  switch (status) {
    case "LIVE":
      return "brand" as const;
    case "FINAL":
    case "WIN":
      return "success" as const;
    case "LOSS":
      return "danger" as const;
    case "POSTPONED":
    case "CANCELED":
    case "DELAYED":
      return "premium" as const;
    default:
      return "muted" as const;
  }
}

type SweatBoardProps = {
  items: SweatBoardItem[];
  onQuickSettle: (
    betId: string,
    result: Exclude<LedgerBetResult, "OPEN">
  ) => Promise<void> | void;
};

const GROUP_ORDER: Array<SweatBoardItem["bucket"]> = [
  "LIVE",
  "UPCOMING",
  "NEARLY_SETTLED",
  "PENDING"
];

export function SweatBoard({ items, onQuickSettle }: SweatBoardProps) {
  const groups = GROUP_ORDER.map((bucket) => ({
    bucket,
    items: items.filter((item) => item.bucket === bucket)
  })).filter((group) => group.items.length);

  const totalRisk = items.reduce((total, item) => total + item.exposure.riskAmount, 0);
  const totalToWin = items.reduce((total, item) => total + item.exposure.toWin, 0);

  return (
    <div className="grid gap-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Exposure</div>
            <div className="mt-2 font-display text-2xl font-semibold text-white">
              {formatUnits(totalRisk).replace(/^\+/, "")} at risk
            </div>
            <div className="mt-2 text-sm text-slate-400">
              {formatUnits(totalToWin)} to win across {items.length} active ticket
              {items.length === 1 ? "" : "s"}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {groups.map((group) => (
              <Badge key={group.bucket} tone={group.bucket === "LIVE" ? "brand" : "muted"}>
                {group.bucket.replace(/_/g, " ")} {group.items.length}
              </Badge>
            ))}
          </div>
        </div>
      </Card>

      {groups.map((group) => (
        <div key={group.bucket} className="grid gap-3">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
            {group.bucket.replace(/_/g, " ")}
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {group.items.map((item) => (
              <Card key={item.betId} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                      {item.league} {item.betType === "PARLAY" ? "Parlay" : "Straight"}
                    </div>
                    <div className="mt-2 font-display text-xl font-semibold text-white">
                      {item.eventLabel ?? item.label}
                    </div>
                    <div className="mt-2 text-sm text-slate-400">{item.label}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={statusTone(item.eventStatus)}>{item.eventStatus ?? "Pending"}</Badge>
                    <Badge tone={statusTone(item.result)}>{item.result}</Badge>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-line bg-slate-950/70 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">State</div>
                    <div className="mt-2 text-sm font-medium text-white">
                      {item.scoreboard ?? item.eventStateDetail ?? "Awaiting live scoring"}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {formatSyncAge(item.lastUpdatedAt)}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-line bg-slate-950/70 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Risk / To Win</div>
                    <div className="mt-2 text-sm font-medium text-white">
                      {formatUnits(item.exposure.riskAmount).replace(/^\+/, "")} /{" "}
                      {formatUnits(item.exposure.toWin)}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-line bg-slate-950/70 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Notes</div>
                    <div className="mt-2 text-sm text-slate-400">{item.notes.join(" ")}</div>
                  </div>
                </div>

                <div className="mt-4 grid gap-2">
                  {item.legs.map((leg) => (
                    <div
                      key={leg.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line/70 bg-slate-950/45 px-4 py-3"
                    >
                      <div>
                        <div className="text-sm font-medium text-white">
                          {leg.marketLabel}: {leg.selection}
                        </div>
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                          {leg.eventLabel ?? "Event pending"}
                        </div>
                      </div>
                      <Badge tone={statusTone(leg.result)}>{leg.result}</Badge>
                    </div>
                  ))}
                </div>

                {item.result === "OPEN" ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {(["WIN", "LOSS", "PUSH", "VOID"] as const).map((result) => (
                      <button
                        key={`${item.betId}-${result}`}
                        type="button"
                        onClick={() => onQuickSettle(item.betId, result)}
                        className="rounded-2xl border border-line px-3 py-2 text-xs font-medium uppercase tracking-[0.16em] text-slate-300"
                      >
                        Mark {result}
                      </button>
                    ))}
                  </div>
                ) : null}
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

import Link from "next/link";

import { SharkScoreRing } from "@/components/branding/shark-score-ring";
import type { BoardMarketView, GameCardView } from "@/lib/types/domain";
import { cn } from "@/lib/utils/cn";

type SortKey = "edge" | "movement" | "start";
type MarketScope = "all" | "moneyline" | "spread" | "total";

type BoardTableRow = {
  game: GameCardView;
  inspectHref: string;
  gameHref: string;
  workflowLabel?: string;
  selected: boolean;
};

type BoardTableProps = {
  rows: BoardTableRow[];
  selectedMarket: MarketScope;
  selectedSort: SortKey;
  sortHrefs: Record<SortKey, string>;
};

function formatStartTime(value: string) {
  return new Date(value).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatMovementValue(movement: number) {
  const absolute = Math.abs(movement);

  if (!absolute) {
    return "Flat";
  }

  return `${movement > 0 ? "↑" : "↓"} ${absolute >= 10 ? absolute.toFixed(0) : absolute.toFixed(1)}`;
}

function formatAmericanOdds(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value) || value === 0) {
    return "—";
  }

  return `${value > 0 ? "+" : ""}${Math.round(value)}`;
}

function getLeadMover(game: GameCardView) {
  const candidates = [
    { label: "ML", movement: game.moneyline.movement },
    { label: "SPR", movement: game.spread.movement },
    { label: "TOT", movement: game.total.movement }
  ];

  return [...candidates].sort((left, right) => Math.abs(right.movement) - Math.abs(left.movement))[0];
}

function getPrimaryBook(game: GameCardView) {
  return (
    game.selectedBook?.name ||
    game.moneyline.bestBook ||
    game.spread.bestBook ||
    game.total.bestBook ||
    "Awaiting book"
  );
}

function getBenchmarkLabel(market: BoardMarketView) {
  const consensus = market.marketTruth?.consensusOddsAmerican;
  if (typeof consensus === "number") {
    return `Cons ${formatAmericanOdds(consensus)}`;
  }

  const fair = market.fairPrice?.fairOddsAmerican;
  if (typeof fair === "number") {
    return `Fair ${formatAmericanOdds(fair)}`;
  }

  const best = market.marketIntelligence?.bestAvailableOddsAmerican;
  if (typeof best === "number") {
    return `Best ${formatAmericanOdds(best)}`;
  }

  return market.marketTruth?.classificationLabel ?? "Market forming";
}

function getDisagreementLabel(market: BoardMarketView) {
  const disagreement = market.marketTruth?.disagreementPct;
  if (typeof disagreement === "number") {
    return `${disagreement.toFixed(1)}% disagreement`;
  }

  const completeness = market.fairPrice?.completenessScore;
  if (typeof completeness === "number") {
    return `${Math.round(completeness)} coverage`;
  }

  return market.marketIntelligence?.staleFlag ? "Stale path" : "Confirmed";
}

function getMovementIntensity(market: BoardMarketView, marketKey: "moneyline" | "spread" | "total") {
  const absolute = Math.abs(market.movement);

  if (!absolute) {
    return 12;
  }

  const normalized = marketKey === "moneyline"
    ? Math.min(100, 18 + absolute * 2.2)
    : Math.min(100, 18 + absolute * 32);

  return normalized;
}

function SortableHeader({
  label,
  href,
  active,
  align = "left"
}: {
  label: string;
  href: string;
  active: boolean;
  align?: "left" | "right";
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-2 rounded-sm border px-2 py-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] transition-colors",
        align === "right" ? "justify-end" : "justify-start",
        active
          ? "border-aqua/35 bg-aqua/10 text-aqua"
          : "border-transparent text-bone/50 hover:border-bone/[0.12] hover:text-bone/85"
      )}
    >
      {label}
      {active ? <span className="text-aqua">•</span> : null}
    </Link>
  );
}

function MarketCell({
  label,
  market,
  emphasized
}: {
  label: string;
  market: BoardMarketView;
  emphasized: boolean;
}) {
  return (
    <div
      className={cn(
        "grid gap-1 rounded-md border px-3 py-2.5",
        emphasized ? "border-aqua/20 bg-aqua/[0.05]" : "border-bone/[0.08] bg-surface"
      )}
    >
      <div className="flex items-center justify-between gap-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-bone/55">
        <span>{label}</span>
        <span className="truncate text-right">{market.bestBook}</span>
      </div>
      <div className="font-mono text-[14px] font-semibold tabular-nums text-text-primary">{market.lineLabel || "Market pending"}</div>
      <div className="flex items-center justify-between gap-3 text-[10px] font-semibold uppercase tracking-[0.08em]">
        <span className="text-bone/55">{getBenchmarkLabel(market)}</span>
        <span className={cn("font-mono tabular-nums", emphasized ? "text-aqua" : "text-bone/70")}>{formatMovementValue(market.movement)}</span>
      </div>
    </div>
  );
}

function MovementSpark({ game, selectedMarket }: { game: GameCardView; selectedMarket: MarketScope }) {
  const cells = [
    { key: "moneyline" as const, label: "ML", market: game.moneyline },
    { key: "spread" as const, label: "SPR", market: game.spread },
    { key: "total" as const, label: "TOT", market: game.total }
  ];

  return (
    <div className="grid gap-2">
      {cells.map((cell) => {
        const active = selectedMarket === "all" || selectedMarket === cell.key;
        return (
          <div key={cell.key} className="grid grid-cols-[32px,1fr,54px] items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em]">
            <span className={cn(active ? "text-bone/85" : "text-bone/45")}>{cell.label}</span>
            <div className="h-[2px] bg-bone/[0.08]">
              <div
                className={cn(
                  "h-full transition-all",
                  active ? "bg-aqua" : "bg-bone/30"
                )}
                style={{ width: `${getMovementIntensity(cell.market, cell.key)}%` }}
              />
            </div>
            <span className={cn("text-right font-mono tabular-nums", active ? "text-aqua" : "text-bone/55")}>{formatMovementValue(cell.market.movement)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function BoardTable({ rows, selectedMarket, selectedSort, sortHrefs }: BoardTableProps) {
  if (!rows.length) {
    return (
      <div className="panel hidden p-6 xl:block">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-bone/55">Board table</div>
        <div className="mt-2 font-display text-[17px] font-semibold text-text-primary">No verified rows are available.</div>
      </div>
    );
  }

  return (
    <section className="panel hidden overflow-hidden !p-0 xl:block">
      <div className="overflow-x-auto">
        <table className="min-w-[1240px] w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-panel/95 backdrop-blur">
            <tr className="border-b border-bone/[0.10] text-[10.5px] font-semibold uppercase tracking-[0.08em] text-bone/55">
              <th className="px-4 py-3">#</th>
              <th className="px-3 py-3">
                <SortableHeader label="Game / Start" href={sortHrefs.start} active={selectedSort === "start"} />
              </th>
              <th className="px-3 py-3">Moneyline</th>
              <th className="px-3 py-3">Spread</th>
              <th className="px-3 py-3">Total</th>
              <th className="px-3 py-3">
                <SortableHeader label="Edge" href={sortHrefs.edge} active={selectedSort === "edge"} />
              </th>
              <th className="px-3 py-3">
                <SortableHeader label="Move" href={sortHrefs.movement} active={selectedSort === "movement"} />
              </th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>

          <tbody>
            {rows.map(({ game, inspectHref, gameHref, workflowLabel, selected }, index) => {
              const leadMover = getLeadMover(game);
              const primaryBook = getPrimaryBook(game);

              return (
                <tr
                  key={game.id}
                  className={cn(
                    "focusable border-b border-bone/[0.05] align-top transition-colors",
                    selected ? "bg-aqua/[0.04]" : "hover:bg-raised/60"
                  )}
                  data-active={selected ? "true" : undefined}
                >
                  <td className="px-4 py-4 align-top">
                    <div className="flex h-7 w-7 items-center justify-center border border-bone/[0.10] bg-surface font-mono text-[11px] font-semibold tabular-nums text-bone/75">
                      {index + 1}
                    </div>
                  </td>

                  <td className="px-3 py-4 align-top">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-bone/55">
                          <span>{game.leagueKey}</span>
                          <span className="text-bone/25">·</span>
                          <span>{game.status}</span>
                          <span className="text-bone/25">·</span>
                          <span className="font-mono tabular-nums">{formatStartTime(game.startTime)}</span>
                        </div>
                        <div className="mt-2 font-display text-[17px] font-semibold tracking-[-0.01em] text-text-primary">
                          {game.awayTeam.abbreviation} <span className="text-bone/35">@</span> {game.homeTeam.abbreviation}
                        </div>
                        <div className="mt-1 text-[12.5px] text-bone/55">{game.venue || "Venue pending"}</div>
                        <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-bone/55">
                          <div className="rounded-sm border border-bone/[0.10] px-2 py-1 text-bone/85">{primaryBook}</div>
                          <div className="rounded-sm border border-bone/[0.08] px-2 py-1">{game.bestBookCount} books</div>
                          <div className="rounded-sm border border-bone/[0.08] px-2 py-1">
                            {leadMover.label} <span className="font-mono tabular-nums">{formatMovementValue(leadMover.movement)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="px-3 py-4 align-top">
                    <MarketCell label="ML" market={game.moneyline} emphasized={selectedMarket === "all" || selectedMarket === "moneyline"} />
                  </td>
                  <td className="px-3 py-4 align-top">
                    <MarketCell label="SPR" market={game.spread} emphasized={selectedMarket === "all" || selectedMarket === "spread"} />
                  </td>
                  <td className="px-3 py-4 align-top">
                    <MarketCell label="TOT" market={game.total} emphasized={selectedMarket === "all" || selectedMarket === "total"} />
                  </td>

                  <td className="px-3 py-4 align-top">
                    <div className="grid gap-3 rounded-md border border-bone/[0.08] bg-surface px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-bone/55">SharkEdge score</div>
                          <div className="mt-2 font-display text-[13px] font-semibold text-text-primary">{game.edgeScore.label}</div>
                        </div>
                        <SharkScoreRing
                          score={game.edgeScore.score}
                          size="sm"
                          tone={game.edgeScore.score >= 65 ? "success" : game.edgeScore.score >= 45 ? "warning" : "brand"}
                        />
                      </div>
                      <div className="grid gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-bone/55">
                        <div>{getDisagreementLabel(game.moneyline)}</div>
                        <div>{getDisagreementLabel(game.spread)}</div>
                        <div>{getDisagreementLabel(game.total)}</div>
                      </div>
                    </div>
                  </td>

                  <td className="px-3 py-4 align-top">
                    <div className="grid gap-3 rounded-md border border-bone/[0.08] bg-surface px-3 py-3">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-bone/55">Movement map</div>
                        <div className="mt-2 font-display text-[13px] font-semibold text-text-primary">
                          <span className="text-aqua">{leadMover.label}</span> leads the board
                        </div>
                      </div>
                      <MovementSpark game={game} selectedMarket={selectedMarket} />
                    </div>
                  </td>

                  <td className="px-4 py-4 align-top">
                    <div className="flex flex-col items-end gap-2">
                      <Link
                        href={inspectHref}
                        className={cn(
                          "rounded-sm border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors",
                          selected
                            ? "border-aqua/40 bg-aqua/10 text-aqua"
                            : "border-bone/[0.12] bg-surface text-text-primary hover:border-aqua/30 hover:bg-aqua/[0.05] hover:text-aqua"
                        )}
                      >
                        {selected ? "Inspecting" : "Inspect"}
                      </Link>
                      <Link
                        href={gameHref}
                        className="rounded-sm border border-bone/[0.10] bg-surface px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-bone/75 transition-colors hover:border-bone/[0.20] hover:text-text-primary"
                      >
                        {workflowLabel ? `Open ${workflowLabel}` : "Game page"}
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

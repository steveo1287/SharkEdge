import Link from "next/link";

import { SharkScoreRing } from "@/components/branding/shark-score-ring";
import type { BoardMarketView, GameCardView } from "@/lib/types/domain";
import { cn } from "@/lib/utils/cn";

type SortKey = "edge" | "movement" | "start";
type MarketScope = "all" | "moneyline" | "spread" | "total";

type BoardTableRow = {
  game: GameCardView;
  inspectHref: string;
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
        "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] transition",
        align === "right" ? "justify-end" : "justify-start",
        active
          ? "border-sky-400/35 bg-sky-500/12 text-sky-200"
          : "border-transparent text-slate-500 hover:border-white/10 hover:bg-white/[0.03] hover:text-slate-200"
      )}
    >
      {label}
      {active ? <span className="text-sky-300">•</span> : null}
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
        "grid gap-1 rounded-[14px] border px-3 py-2.5",
        emphasized ? "border-sky-400/18 bg-sky-500/[0.05]" : "border-white/8 bg-white/[0.02]"
      )}
    >
      <div className="flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.16em] text-slate-500">
        <span>{label}</span>
        <span className="truncate text-right">{market.bestBook}</span>
      </div>
      <div className="text-sm font-semibold tracking-tight text-white">{market.lineLabel || "Market pending"}</div>
      <div className="flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.14em]">
        <span className="text-slate-400">{getBenchmarkLabel(market)}</span>
        <span className={cn(emphasized ? "text-sky-300" : "text-slate-300")}>{formatMovementValue(market.movement)}</span>
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
          <div key={cell.key} className="grid grid-cols-[32px,1fr,54px] items-center gap-2 text-[10px] uppercase tracking-[0.16em]">
            <span className={cn("font-semibold", active ? "text-slate-200" : "text-slate-500")}>{cell.label}</span>
            <div className="h-1.5 rounded-full bg-white/[0.06]">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  active ? "bg-sky-300" : "bg-slate-500/60"
                )}
                style={{ width: `${getMovementIntensity(cell.market, cell.key)}%` }}
              />
            </div>
            <span className={cn("text-right", active ? "text-sky-300" : "text-slate-400")}>{formatMovementValue(cell.market.movement)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function BoardTable({ rows, selectedMarket, selectedSort, sortHrefs }: BoardTableProps) {
  if (!rows.length) {
    return (
      <div className="mobile-surface hidden xl:block">
        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Board table</div>
        <div className="mt-2 text-[1rem] font-semibold text-white">No verified rows are available.</div>
      </div>
    );
  }

  return (
    <section className="mobile-surface hidden !p-0 xl:block">
      <div className="overflow-x-auto">
        <table className="min-w-[1240px] w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-[#08111d]/96 backdrop-blur">
            <tr className="border-b border-white/8 text-[10px] uppercase tracking-[0.18em] text-slate-500">
              <th className="px-4 py-3 font-semibold">#</th>
              <th className="px-3 py-3 font-semibold">
                <SortableHeader label="Game / start" href={sortHrefs.start} active={selectedSort === "start"} />
              </th>
              <th className="px-3 py-3 font-semibold">Moneyline</th>
              <th className="px-3 py-3 font-semibold">Spread</th>
              <th className="px-3 py-3 font-semibold">Total</th>
              <th className="px-3 py-3 font-semibold">
                <SortableHeader label="Edge" href={sortHrefs.edge} active={selectedSort === "edge"} />
              </th>
              <th className="px-3 py-3 font-semibold">
                <SortableHeader label="Move" href={sortHrefs.movement} active={selectedSort === "movement"} />
              </th>
              <th className="px-4 py-3 font-semibold text-right">Action</th>
            </tr>
          </thead>

          <tbody>
            {rows.map(({ game, inspectHref, selected }, index) => {
              const leadMover = getLeadMover(game);
              const primaryBook = getPrimaryBook(game);

              return (
                <tr
                  key={game.id}
                  className={cn(
                    "border-b border-white/6 align-top transition",
                    selected ? "bg-sky-500/[0.06]" : "hover:bg-white/[0.025]"
                  )}
                >
                  <td className="px-4 py-4 align-top">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/8 bg-white/[0.03] text-xs font-semibold text-slate-200">
                      {index + 1}
                    </div>
                  </td>

                  <td className="px-3 py-4 align-top">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-slate-500">
                          <span>{game.leagueKey}</span>
                          <span>•</span>
                          <span>{game.status}</span>
                          <span>•</span>
                          <span>{formatStartTime(game.startTime)}</span>
                        </div>
                        <div className="mt-2 text-[1rem] font-semibold tracking-tight text-white">
                          {game.awayTeam.abbreviation} <span className="text-slate-500">@</span> {game.homeTeam.abbreviation}
                        </div>
                        <div className="mt-1 text-sm text-slate-400">{game.venue || "Venue pending"}</div>
                        <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.16em] text-slate-400">
                          <div className="rounded-full border border-white/8 px-3 py-1.5 text-slate-200">{primaryBook}</div>
                          <div className="rounded-full border border-white/8 px-3 py-1.5">{game.bestBookCount} books</div>
                          <div className="rounded-full border border-white/8 px-3 py-1.5">{leadMover.label} {formatMovementValue(leadMover.movement)}</div>
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
                    <div className="grid gap-3 rounded-[14px] border border-white/8 bg-white/[0.02] px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">SharkEdge score</div>
                          <div className="mt-2 text-sm font-semibold text-white">{game.edgeScore.label}</div>
                        </div>
                        <SharkScoreRing
                          score={game.edgeScore.score}
                          size="sm"
                          tone={game.edgeScore.score >= 65 ? "success" : game.edgeScore.score >= 45 ? "warning" : "brand"}
                        />
                      </div>
                      <div className="grid gap-1 text-[10px] uppercase tracking-[0.16em] text-slate-400">
                        <div>{getDisagreementLabel(game.moneyline)}</div>
                        <div>{getDisagreementLabel(game.spread)}</div>
                        <div>{getDisagreementLabel(game.total)}</div>
                      </div>
                    </div>
                  </td>

                  <td className="px-3 py-4 align-top">
                    <div className="grid gap-3 rounded-[14px] border border-white/8 bg-white/[0.02] px-3 py-3">
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Movement map</div>
                        <div className="mt-2 text-sm font-semibold text-white">{leadMover.label} leads the board</div>
                      </div>
                      <MovementSpark game={game} selectedMarket={selectedMarket} />
                    </div>
                  </td>

                  <td className="px-4 py-4 align-top">
                    <div className="flex flex-col items-end gap-2">
                      <Link
                        href={inspectHref}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] transition",
                          selected
                            ? "border-sky-300/50 bg-sky-500/16 text-sky-100"
                            : "border-white/10 bg-white/[0.03] text-white hover:border-sky-400/25 hover:bg-sky-500/10"
                        )}
                      >
                        {selected ? "Inspecting" : "Inspect"}
                      </Link>
                      <Link
                        href={game.detailHref ?? `/game/${game.id}`}
                        className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-200 transition hover:border-white/18 hover:bg-white/[0.06]"
                      >
                        Game page
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

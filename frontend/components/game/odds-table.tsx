import Link from "next/link";

import { Card } from "@/components/ui/card";
import { formatLongDate } from "@/lib/formatters/date";
import { americanToImplied, stripVig } from "@/lib/odds/index";
import type { BetSignalView, MatchupDetailView } from "@/lib/types/domain";
import { cn } from "@/lib/utils/cn";

type MarketFocus = "all" | "spread" | "moneyline" | "total";

type OddsTableProps = {
  detail: MatchupDetailView;
  marketFocus?: MarketFocus;
  bookFocus?: string | null;
};

type ParsedSelection = {
  label: string;
  line: string | null;
  odds: number | null;
  oddsLabel: string;
};

type ParsedMarketCell = {
  available: boolean;
  left: ParsedSelection | null;
  right: ParsedSelection | null;
};

type RankedBookRow = {
  sportsbookName: string;
  spread: ParsedMarketCell;
  moneyline: ParsedMarketCell;
  total: ParsedMarketCell;
  rank: number;
  tags: string[];
  matchesFocusedBook: boolean;
  bestMatches: Array<"spread" | "moneyline" | "total">;
};

function isMissingMarket(value: string) {
  return !value || value === "Pending" || value === "No market" || value === "-";
}

function parseOddsValue(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed === "--" || trimmed === "-") {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatAmericanOdds(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value) || value === 0) {
    return "—";
  }

  return `${value > 0 ? "+" : ""}${Math.round(value)}`;
}

function parseMoneylineToken(token: string): ParsedSelection | null {
  const trimmed = token.trim();
  const match = trimmed.match(/^(.*?)\s+([+-]\d{2,4}|--)$/);

  if (!match) {
    return {
      label: trimmed,
      line: null,
      odds: null,
      oddsLabel: "—"
    };
  }

  return {
    label: match[1].trim(),
    line: null,
    odds: parseOddsValue(match[2]),
    oddsLabel: match[2] === "--" ? "—" : match[2]
  };
}

function parseLinedToken(token: string): ParsedSelection | null {
  const trimmed = token.trim();
  const match = trimmed.match(/^(.*?)\s+((?:[+-]?\d+(?:\.\d+)?)|PK|Pick|pick)\s+\(([+-]\d{2,4}|--)\)$/);

  if (!match) {
    return {
      label: trimmed,
      line: null,
      odds: null,
      oddsLabel: "—"
    };
  }

  return {
    label: match[1].trim(),
    line: match[2],
    odds: parseOddsValue(match[3]),
    oddsLabel: match[3] === "--" ? "—" : match[3]
  };
}

function parseMarketCell(value: string, marketType: "spread" | "moneyline" | "total"): ParsedMarketCell {
  if (isMissingMarket(value)) {
    return {
      available: false,
      left: null,
      right: null
    };
  }

  const [leftRaw, rightRaw] = value.split("|").map((part) => part.trim());
  const parser = marketType === "moneyline" ? parseMoneylineToken : parseLinedToken;
  const left = leftRaw ? parser(leftRaw) : null;
  const right = rightRaw ? parser(rightRaw) : null;

  return {
    available: Boolean(left || right),
    left,
    right
  };
}

function getNoVigLabel(parsed: ParsedMarketCell) {
  const prices = [parsed.left?.odds, parsed.right?.odds].filter(
    (value): value is number => typeof value === "number"
  );

  if (prices.length < 2) {
    return null;
  }

  const noVig = stripVig(
    prices
      .map((price) => americanToImplied(price))
      .filter((probability): probability is number => typeof probability === "number")
  );

  if (noVig.length < 2) {
    return null;
  }

  return `${(noVig[0] * 100).toFixed(1)}% / ${(noVig[1] * 100).toFixed(1)}%`;
}

function getPrimarySignal(detail: MatchupDetailView, marketType: "spread" | "moneyline" | "total") {
  return (
    detail.betSignals.find(
      (signal) => signal.marketType === marketType && signal.supportStatus !== "COMING_SOON"
    ) ?? null
  );
}

function getDeskBestValue(detail: MatchupDetailView, marketType: "spread" | "moneyline" | "total") {
  if (!detail.oddsSummary) {
    return null;
  }

  if (marketType === "spread") {
    return detail.oddsSummary.bestSpread;
  }

  if (marketType === "moneyline") {
    return detail.oddsSummary.bestMoneyline;
  }

  return detail.oddsSummary.bestTotal;
}

function matchesDeskBest(value: string, bestHint: string | null) {
  if (!bestHint || isMissingMarket(value)) {
    return false;
  }

  return value.includes(bestHint) || bestHint.includes(value);
}

function getRowRank(
  detail: MatchupDetailView,
  row: MatchupDetailView["books"][number],
  marketFocus: MarketFocus,
  bookFocus: string | null
): RankedBookRow {
  const spread = parseMarketCell(row.spread, "spread");
  const moneyline = parseMarketCell(row.moneyline, "moneyline");
  const total = parseMarketCell(row.total, "total");
  const sportsbookName = row.sportsbook.name;
  const bestMatches: Array<"spread" | "moneyline" | "total"> = [];
  let rank = 0;

  const availabilityScore =
    (spread.available ? 10 : 0) + (moneyline.available ? 10 : 0) + (total.available ? 10 : 0);
  rank += availabilityScore;

  if (matchesDeskBest(row.spread, getDeskBestValue(detail, "spread"))) {
    bestMatches.push("spread");
    rank += 9;
  }

  if (matchesDeskBest(row.moneyline, getDeskBestValue(detail, "moneyline"))) {
    bestMatches.push("moneyline");
    rank += 9;
  }

  if (matchesDeskBest(row.total, getDeskBestValue(detail, "total"))) {
    bestMatches.push("total");
    rank += 9;
  }

  const focusSignal = marketFocus === "all" ? null : getPrimarySignal(detail, marketFocus);
  const signalBook = focusSignal?.sportsbookName?.toLowerCase().trim() ?? null;
  const normalizedBook = sportsbookName.toLowerCase().trim();
  const matchesFocusedBook = Boolean(bookFocus && normalizedBook === bookFocus.toLowerCase().trim());

  if (matchesFocusedBook) {
    rank += 18;
  }

  if (signalBook && normalizedBook === signalBook) {
    rank += 12;
  }

  if (marketFocus !== "all") {
    const focusedCell = marketFocus === "spread" ? spread : marketFocus === "moneyline" ? moneyline : total;
    if (focusedCell.available) {
      rank += 10;
    }
  }

  const tags: string[] = [];
  if (matchesFocusedBook) {
    tags.push("Target book");
  }
  if (bestMatches.length) {
    tags.push(`Best ${bestMatches.map((item) => item === "moneyline" ? "ML" : item === "spread" ? "SPR" : "TOT").join(" / ")}`);
  }
  if (availabilityScore === 30) {
    tags.push("Full board");
  }

  return {
    sportsbookName,
    spread,
    moneyline,
    total,
    rank,
    tags,
    matchesFocusedBook,
    bestMatches
  };
}

function buildFocusHref(nextFocus: MarketFocus, bookFocus?: string | null) {
  const params = new URLSearchParams();
  if (nextFocus !== "all") {
    params.set("market", nextFocus);
  }
  if (bookFocus) {
    params.set("book", bookFocus);
  }

  const query = params.toString();
  return query ? `?${query}#market-target` : "#market-target";
}

function buildBookHref(marketFocus: MarketFocus, book: string) {
  const params = new URLSearchParams();
  if (marketFocus !== "all") {
    params.set("market", marketFocus);
  }
  params.set("book", book);
  return `?${params.toString()}#market-target`;
}

function buildClearHref(marketFocus: MarketFocus) {
  return buildFocusHref(marketFocus);
}

function MarketPill({
  label,
  href,
  active,
  tone = "default"
}: {
  label: string;
  href: string;
  active: boolean;
  tone?: "default" | "warning";
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] transition",
        active
          ? tone === "warning"
            ? "border-amber-400/30 bg-amber-500/12 text-amber-200"
            : "border-sky-400/35 bg-sky-500/12 text-sky-200"
          : "border-white/8 bg-white/[0.03] text-slate-400 hover:border-white/12 hover:text-slate-200"
      )}
    >
      {label}
      {active ? <span>•</span> : null}
    </Link>
  );
}

function MarketSelectionCell({
  parsed,
  emphasized,
  best,
  stale
}: {
  parsed: ParsedMarketCell;
  emphasized: boolean;
  best: boolean;
  stale: boolean;
}) {
  if (!parsed.available || !parsed.left || !parsed.right) {
    return <div className="text-sm text-slate-500">No market</div>;
  }

  const noVigLabel = getNoVigLabel(parsed);

  return (
    <div
      className={cn(
        "rounded-[1rem] border px-3 py-3",
        emphasized
          ? "border-sky-400/20 bg-sky-500/[0.05]"
          : best
            ? "border-emerald-400/15 bg-emerald-500/[0.05]"
            : "border-white/8 bg-white/[0.02]"
      )}
    >
      <div className="grid gap-2">
        {[parsed.left, parsed.right].map((selection) => (
          <div key={`${selection.label}:${selection.line ?? "na"}:${selection.oddsLabel}`} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-white">{selection.label}</div>
              <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                {selection.line ? `Line ${selection.line}` : "Price"}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold text-white">{selection.oddsLabel}</div>
              {typeof selection.odds === "number" ? (
                <div className="text-[11px] text-slate-500">
                  Implied {(((americanToImplied(selection.odds) ?? 0) * 100).toFixed(1))}%
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.16em]">
        {best ? (
          <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-1 text-emerald-200">
            Desk best
          </span>
        ) : null}
        {emphasized ? (
          <span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-2 py-1 text-sky-200">
            Focused
          </span>
        ) : null}
        {stale ? (
          <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-2 py-1 text-amber-200">
            Confirm price
          </span>
        ) : null}
        {noVigLabel ? <span className="text-slate-500">No-vig {noVigLabel}</span> : null}
      </div>
    </div>
  );
}

function TapeCard({
  label,
  value,
  note,
  tone = "default"
}: {
  label: string;
  value: string;
  note: string;
  tone?: "default" | "warning";
}) {
  return (
    <div
      className={cn(
        "rounded-[1.15rem] border px-4 py-3",
        tone === "warning"
          ? "border-amber-400/15 bg-amber-500/[0.06]"
          : "border-white/8 bg-slate-950/60"
      )}
    >
      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 text-base font-semibold text-white">{value}</div>
      <div className="mt-1 text-xs leading-5 text-slate-500">{note}</div>
    </div>
  );
}

function MarketSignalCard({
  label,
  marketType,
  detail,
  signal,
  active,
  bookFocus
}: {
  label: string;
  marketType: "spread" | "moneyline" | "total";
  detail: MatchupDetailView;
  signal: BetSignalView | null;
  active: boolean;
  bookFocus: string | null;
}) {
  const bestDesk = getDeskBestValue(detail, marketType) ?? "Awaiting desk price";
  const fairPrice =
    signal?.fairPrice?.fairOddsAmerican ?? signal?.marketTruth?.fairOddsAmerican ?? null;
  const delta = signal?.marketDeltaAmerican ?? null;
  const stale = Boolean(signal?.marketIntelligence?.staleFlag || signal?.marketTruth?.stale);
  const href = buildFocusHref(marketType, bookFocus);

  return (
    <Link
      href={href}
      className={cn(
        "grid gap-3 rounded-[1.15rem] border px-4 py-4 transition",
        active
          ? "border-sky-400/25 bg-sky-500/[0.08]"
          : "border-white/8 bg-slate-950/55 hover:border-white/12 hover:bg-slate-950/70"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
        {signal?.sportsbookName ? (
          <div className="truncate text-[11px] uppercase tracking-[0.16em] text-slate-400">
            {signal.sportsbookName}
          </div>
        ) : null}
      </div>

      <div>
        <div className="text-base font-semibold text-white">{bestDesk}</div>
        <div className="mt-1 text-xs leading-5 text-slate-400">
          {signal?.selection ?? "No qualified target angle is attached yet."}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.16em]">
        {fairPrice !== null ? (
          <span className="rounded-full border border-white/8 bg-white/[0.03] px-2 py-1 text-slate-300">
            Fair {formatAmericanOdds(fairPrice)}
          </span>
        ) : null}
        {delta !== null ? (
          <span className="rounded-full border border-white/8 bg-white/[0.03] px-2 py-1 text-slate-300">
            Gap {formatAmericanOdds(delta)}
          </span>
        ) : null}
        {typeof signal?.expectedValuePct === "number" ? (
          <span className="rounded-full border border-white/8 bg-white/[0.03] px-2 py-1 text-slate-300">
            EV {signal.expectedValuePct.toFixed(1)}%
          </span>
        ) : null}
        {stale ? (
          <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-2 py-1 text-amber-200">
            Stale watch
          </span>
        ) : null}
      </div>
    </Link>
  );
}

export function OddsTable({
  detail,
  marketFocus = "all",
  bookFocus = null
}: OddsTableProps) {
  const openingPoint = detail.lineMovement[0] ?? null;
  const currentPoint = detail.lineMovement[detail.lineMovement.length - 1] ?? null;
  const providerWarning = detail.providerHealth.state !== "HEALTHY" || detail.providerHealth.warnings.length > 0;

  const spreadMove =
    openingPoint &&
    currentPoint &&
    typeof openingPoint.spreadLine === "number" &&
    typeof currentPoint.spreadLine === "number"
      ? currentPoint.spreadLine - openingPoint.spreadLine
      : null;

  const totalMove =
    openingPoint &&
    currentPoint &&
    typeof openingPoint.totalLine === "number" &&
    typeof currentPoint.totalLine === "number"
      ? currentPoint.totalLine - openingPoint.totalLine
      : null;

  const rankedRows = detail.books
    .map((row) => ({
      row,
      ranked: getRowRank(detail, row, marketFocus, bookFocus)
    }))
    .sort((left, right) => {
      if (right.ranked.rank !== left.ranked.rank) {
        return right.ranked.rank - left.ranked.rank;
      }
      return left.ranked.sportsbookName.localeCompare(right.ranked.sportsbookName);
    });

  const focusSignal = marketFocus === "all" ? null : getPrimarySignal(detail, marketFocus);

  return (
    <div className="grid gap-4 xl:grid-cols-[1.24fr_0.76fr] xl:gap-5">
      <div className="grid gap-4">
        <Card id="market-target" className="surface-panel p-4 sm:p-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
                  Market execution deck
                </div>
                <div className="mt-1 text-[1.2rem] font-semibold text-white">
                  Best book, fair view, and target market focus
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <MarketPill label="All" href={buildFocusHref("all")} active={marketFocus === "all"} />
                <MarketPill
                  label="Moneyline"
                  href={buildFocusHref("moneyline", bookFocus)}
                  active={marketFocus === "moneyline"}
                />
                <MarketPill
                  label="Spread"
                  href={buildFocusHref("spread", bookFocus)}
                  active={marketFocus === "spread"}
                />
                <MarketPill
                  label="Total"
                  href={buildFocusHref("total", bookFocus)}
                  active={marketFocus === "total"}
                />
                {bookFocus ? (
                  <MarketPill label="Clear book" href={buildClearHref(marketFocus)} active={false} tone="warning" />
                ) : null}
              </div>
            </div>

            {providerWarning ? (
              <div className="rounded-[1rem] border border-amber-400/20 bg-amber-500/[0.08] px-4 py-3 text-sm text-amber-100">
                <div className="font-semibold uppercase tracking-[0.16em] text-[11px] text-amber-200">
                  Feed caution
                </div>
                <div className="mt-2 leading-6">
                  {detail.providerHealth.summary} {detail.providerHealth.freshnessLabel}
                </div>
                {detail.providerHealth.warnings.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {detail.providerHealth.warnings.slice(0, 3).map((warning) => (
                      <span
                        key={warning}
                        className="rounded-full border border-amber-400/20 bg-black/20 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-amber-100"
                      >
                        {warning}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-3 lg:grid-cols-3">
              <MarketSignalCard
                label="Moneyline"
                marketType="moneyline"
                detail={detail}
                signal={getPrimarySignal(detail, "moneyline")}
                active={marketFocus === "moneyline"}
                bookFocus={bookFocus}
              />
              <MarketSignalCard
                label="Spread"
                marketType="spread"
                detail={detail}
                signal={getPrimarySignal(detail, "spread")}
                active={marketFocus === "spread"}
                bookFocus={bookFocus}
              />
              <MarketSignalCard
                label="Total"
                marketType="total"
                detail={detail}
                signal={getPrimarySignal(detail, "total")}
                active={marketFocus === "total"}
                bookFocus={bookFocus}
              />
            </div>
          </div>
        </Card>

        <div className="min-w-0 overflow-hidden rounded-[1.25rem] border border-white/8 bg-slate-950/45">
          <div className="overflow-x-auto">
            <table className="min-w-[1080px] w-full border-collapse text-left">
              <thead className="bg-[#08111d]/96 text-[10px] uppercase tracking-[0.18em] text-slate-500 backdrop-blur">
                <tr className="border-b border-white/8">
                  <th className="px-4 py-3 font-semibold">#</th>
                  <th className="px-3 py-3 font-semibold">Book</th>
                  <th className="px-3 py-3 font-semibold">Moneyline</th>
                  <th className="px-3 py-3 font-semibold">Spread</th>
                  <th className="px-3 py-3 font-semibold">Total</th>
                  <th className="px-3 py-3 font-semibold">Benchmark</th>
                  <th className="px-4 py-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {rankedRows.map(({ row, ranked }, index) => {
                  const stale = providerWarning || Boolean(focusSignal?.marketIntelligence?.staleFlag || focusSignal?.marketTruth?.stale);

                  return (
                    <tr
                      key={row.sportsbook.id}
                      className={cn(
                        "border-b border-white/6 align-top transition",
                        ranked.matchesFocusedBook ? "bg-sky-500/[0.06]" : "hover:bg-white/[0.02]"
                      )}
                    >
                      <td className="px-4 py-4 align-top">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/8 bg-white/[0.03] text-xs font-semibold text-slate-200">
                          {index + 1}
                        </div>
                      </td>

                      <td className="px-3 py-4 align-top">
                        <div className="grid gap-2">
                          <div className="text-sm font-semibold text-white">{ranked.sportsbookName}</div>
                          <div className="flex flex-wrap gap-2">
                            {ranked.tags.length ? (
                              ranked.tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="rounded-full border border-white/8 bg-white/[0.03] px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-300"
                                >
                                  {tag}
                                </span>
                              ))
                            ) : (
                              <span className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
                                Board available
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-3 py-4 align-top">
                        <MarketSelectionCell
                          parsed={ranked.moneyline}
                          emphasized={marketFocus === "moneyline"}
                          best={ranked.bestMatches.includes("moneyline")}
                          stale={stale}
                        />
                      </td>
                      <td className="px-3 py-4 align-top">
                        <MarketSelectionCell
                          parsed={ranked.spread}
                          emphasized={marketFocus === "spread"}
                          best={ranked.bestMatches.includes("spread")}
                          stale={stale}
                        />
                      </td>
                      <td className="px-3 py-4 align-top">
                        <MarketSelectionCell
                          parsed={ranked.total}
                          emphasized={marketFocus === "total"}
                          best={ranked.bestMatches.includes("total")}
                          stale={stale}
                        />
                      </td>

                      <td className="px-3 py-4 align-top">
                        <div className="grid gap-2 rounded-[1rem] border border-white/8 bg-white/[0.02] px-3 py-3 text-sm text-slate-300">
                          <div>
                            <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Desk best</div>
                            <div className="mt-1 text-sm font-medium text-white">
                              {marketFocus === "spread"
                                ? getDeskBestValue(detail, "spread") ?? "Awaiting"
                                : marketFocus === "moneyline"
                                  ? getDeskBestValue(detail, "moneyline") ?? "Awaiting"
                                  : marketFocus === "total"
                                    ? getDeskBestValue(detail, "total") ?? "Awaiting"
                                    : detail.oddsSummary?.sourceLabel ?? "Best board"}
                            </div>
                          </div>
                          {focusSignal ? (
                            <>
                              <div>
                                <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Fair</div>
                                <div className="mt-1 text-sm font-medium text-white">
                                  {formatAmericanOdds(
                                    focusSignal.fairPrice?.fairOddsAmerican ??
                                      focusSignal.marketTruth?.fairOddsAmerican ??
                                      null
                                  )}
                                </div>
                              </div>
                              <div>
                                <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Gap / EV</div>
                                <div className="mt-1 text-sm font-medium text-white">
                                  {focusSignal.marketDeltaAmerican !== null &&
                                  focusSignal.marketDeltaAmerican !== undefined
                                    ? formatAmericanOdds(focusSignal.marketDeltaAmerican)
                                    : "—"}
                                  {typeof focusSignal.expectedValuePct === "number"
                                    ? ` • ${focusSignal.expectedValuePct.toFixed(1)}%`
                                    : ""}
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="text-xs leading-6 text-slate-500">
                              Set a target market to compare fair price and gap against the desk.
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-4 align-top text-right">
                        <div className="flex flex-col items-end gap-2">
                          <Link
                            href={buildBookHref(marketFocus, ranked.sportsbookName)}
                            className="inline-flex rounded-full border border-sky-400/25 bg-sky-500/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-200"
                          >
                            {ranked.matchesFocusedBook ? "Focused" : "Target book"}
                          </Link>
                          <span className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
                            Score {ranked.rank}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid gap-4">
        <Card className="surface-panel p-4 sm:p-5">
          <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
            Tape and freshness
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <TapeCard
              label="Opening spread"
              value={
                openingPoint?.spreadLine !== null && openingPoint?.spreadLine !== undefined
                  ? String(openingPoint.spreadLine)
                  : "N/A"
              }
              note="First stored spread snapshot for this matchup."
            />
            <TapeCard
              label="Current spread"
              value={
                currentPoint?.spreadLine !== null && currentPoint?.spreadLine !== undefined
                  ? String(currentPoint.spreadLine)
                  : "N/A"
              }
              note="Most recent spread snapshot currently stored."
            />
            <TapeCard
              label="Spread move"
              value={spreadMove === null ? "N/A" : `${spreadMove > 0 ? "+" : ""}${spreadMove.toFixed(1)} pts`}
              note="Opening versus latest tracked spread."
            />
            <TapeCard
              label="Total move"
              value={totalMove === null ? "N/A" : `${totalMove > 0 ? "+" : ""}${totalMove.toFixed(1)} pts`}
              note="Opening versus latest tracked total."
            />
            <TapeCard
              label="Feed freshness"
              value={detail.providerHealth.freshnessLabel}
              note={detail.providerHealth.summary}
              tone={providerWarning ? "warning" : "default"}
            />
            <TapeCard
              label="Focus"
              value={
                marketFocus === "all"
                  ? bookFocus
                    ? `Book: ${bookFocus}`
                    : "All markets"
                  : `${marketFocus}${bookFocus ? ` @ ${bookFocus}` : ""}`
              }
              note="Use market and book focus to line up the execution view with the decision module."
            />
          </div>
        </Card>

        <Card className="surface-panel p-4 sm:p-5">
          <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
            Snapshot timeline
          </div>
          <div className="mt-4 grid gap-3">
            {detail.lineMovement.length ? (
              detail.lineMovement.map((point, index) => (
                <div
                  key={point.capturedAt}
                  className={cn(
                    "rounded-[1.15rem] border px-4 py-3",
                    index === detail.lineMovement.length - 1
                      ? "border-sky-400/20 bg-sky-500/10"
                      : "border-white/8 bg-slate-950/60"
                  )}
                >
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    {formatLongDate(point.capturedAt)}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-300">
                    <span>Spread {point.spreadLine ?? "-"}</span>
                    <span>Total {point.totalLine ?? "-"}</span>
                  </div>
                </div>
              ))
            ) : detail.marketRanges?.length ? (
              detail.marketRanges.map((range) => (
                <div
                  key={range.label}
                  className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-3"
                >
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    {range.label}
                  </div>
                  <div className="mt-2 text-sm text-slate-300">{range.value}</div>
                </div>
              ))
            ) : (
              <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-3 text-sm leading-6 text-slate-400">
                Historical market snapshots are not available for this matchup yet.
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

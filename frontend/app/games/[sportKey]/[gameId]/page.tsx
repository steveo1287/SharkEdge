import Link from "next/link";
import type { ReactNode } from "react";

import {
  type Bookmaker,
  type GameDetailResponse,
  type MarketOffer,
  type PointRange,
  type RecentResult,
  formatAmericanOdds,
  formatBoardUpdatedTime,
  formatBookmakerMarket,
  formatCommenceTime,
  formatPoint,
  formatRange,
  getBestOfferText,
  getGameDetails,
  summarizeBookmakers
} from "../../../../lib/shark-odds";

export const dynamic = "force-dynamic";

type GamePageProps = {
  params: Promise<{
    sportKey: string;
    gameId: string;
  }>;
};

function detailShell(children: ReactNode) {
  return (
    <div
      style={{
        background:
          "linear-gradient(180deg, rgba(22, 16, 48, 0.94), rgba(10, 11, 28, 0.9))",
        border: "1px solid rgba(102, 232, 255, 0.18)",
        borderRadius: 28,
        boxShadow:
          "0 24px 60px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.04)"
      }}
    >
      {children}
    </div>
  );
}

function heroStat(label: string, value: string, accent: string) {
  return (
    <div
      style={{
        padding: 18,
        borderRadius: 20,
        background: "rgba(255, 255, 255, 0.04)",
        border: "1px solid rgba(255, 255, 255, 0.08)"
      }}
    >
      <div
        style={{
          color: accent,
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: "0.14em",
          marginBottom: 8,
          textTransform: "uppercase"
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: "#fff7fb",
          fontFamily: "var(--font-display), 'Avenir Next', sans-serif",
          fontSize: 24,
          fontWeight: 700
        }}
      >
        {value}
      </div>
    </div>
  );
}

function marketCard(title: string, offers: MarketOffer[], accent: string) {
  return (
    <div
      style={{
        padding: 18,
        borderRadius: 20,
        background: "rgba(255, 255, 255, 0.04)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        display: "grid",
        gap: 12
      }}
    >
      <div
        style={{
          color: accent,
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: "0.14em",
          textTransform: "uppercase"
        }}
      >
        {title}
      </div>

      {offers.length ? (
        offers.map((offer) => (
          <div
            key={`${title}-${offer.name}`}
            style={{
              display: "grid",
              gap: 6
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12
              }}
            >
              <div style={{ color: "#fff7fb", fontWeight: 700 }}>{offer.name}</div>
              <div style={{ color: "#fff7fb", fontWeight: 700 }}>
                {formatAmericanOdds(offer.best_price)}
              </div>
            </div>
            <div style={{ color: "#c7d0f6", fontSize: 13, lineHeight: 1.5 }}>
              Best at {summarizeBookmakers(offer.best_bookmakers)}
            </div>
            <div style={{ color: "#9ba4cc", fontSize: 12 }}>
              Avg {formatAmericanOdds(offer.average_price)}
              {offer.consensus_point !== null
                ? ` | Consensus ${formatPoint(offer.consensus_point)}`
                : ""}
            </div>
          </div>
        ))
      ) : (
        <div style={{ color: "#9ba4cc", fontSize: 14 }}>No line available.</div>
      )}
    </div>
  );
}

function rangeCard(title: string, awayTeam: string, homeTeam: string, away: PointRange | null, home: PointRange | null) {
  return (
    <div
      style={{
        padding: 18,
        borderRadius: 20,
        background: "rgba(255, 255, 255, 0.04)",
        border: "1px solid rgba(255, 255, 255, 0.08)"
      }}
    >
      <div
        style={{
          color: "#ffd28f",
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: "0.14em",
          marginBottom: 10,
          textTransform: "uppercase"
        }}
      >
        {title}
      </div>
      <div style={{ display: "grid", gap: 8, color: "#fff7fb", fontSize: 14 }}>
        <div>
          {awayTeam}: <span style={{ color: "#c7d0f6" }}>{formatRange(away)}</span>
        </div>
        <div>
          {homeTeam}: <span style={{ color: "#c7d0f6" }}>{formatRange(home)}</span>
        </div>
      </div>
    </div>
  );
}

function totalRangeCard(overRange: PointRange | null, underRange: PointRange | null) {
  return (
    <div
      style={{
        padding: 18,
        borderRadius: 20,
        background: "rgba(255, 255, 255, 0.04)",
        border: "1px solid rgba(255, 255, 255, 0.08)"
      }}
    >
      <div
        style={{
          color: "#49e7ff",
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: "0.14em",
          marginBottom: 10,
          textTransform: "uppercase"
        }}
      >
        Total Line Range
      </div>
      <div style={{ display: "grid", gap: 8, color: "#fff7fb", fontSize: 14 }}>
        <div>
          Over: <span style={{ color: "#c7d0f6" }}>{formatRange(overRange, false)}</span>
        </div>
        <div>
          Under: <span style={{ color: "#c7d0f6" }}>{formatRange(underRange, false)}</span>
        </div>
      </div>
    </div>
  );
}

function resultCard(result: RecentResult) {
  const accent =
    result.result === "W" ? "#74f7bf" : result.result === "L" ? "#ff9ccf" : "#ffd28f";

  return (
    <div
      key={result.id}
      style={{
        padding: 14,
        borderRadius: 16,
        background: "rgba(255, 255, 255, 0.04)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        display: "grid",
        gap: 8
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12
        }}
      >
        <div style={{ color: "#fff7fb", fontWeight: 700 }}>{result.opponent}</div>
        <div style={{ color: accent, fontWeight: 800 }}>{result.result}</div>
      </div>
      <div style={{ color: "#c7d0f6", fontSize: 13 }}>
        {result.location} | {formatCommenceTime(result.commence_time)}
      </div>
      <div style={{ color: "#fff7fb", fontSize: 14 }}>
        {result.team_score}-{result.opponent_score} | Margin {result.margin > 0 ? "+" : ""}
        {result.margin}
      </div>
    </div>
  );
}

function teamFormCard(
  teamName: string,
  form: GameDetailResponse["team_form"][string],
  accent: string
) {
  return (
    <div
      style={{
        padding: 22,
        borderRadius: 22,
        background: "rgba(255, 255, 255, 0.04)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        display: "grid",
        gap: 16
      }}
    >
      <div>
        <div
          style={{
            color: accent,
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.14em",
            marginBottom: 8,
            textTransform: "uppercase"
          }}
        >
          Team Form
        </div>
        <div
          style={{
            color: "#fff7fb",
            fontFamily: "var(--font-display), 'Avenir Next', sans-serif",
            fontSize: 28,
            fontWeight: 700
          }}
        >
          {teamName}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: 12
        }}
      >
        {heroStat("Record", form.summary.record, accent)}
        {heroStat(
          "Avg For",
          form.summary.avg_points_for?.toString() ?? "--",
          "#49e7ff"
        )}
        {heroStat(
          "Avg Against",
          form.summary.avg_points_against?.toString() ?? "--",
          "#ff76c1"
        )}
        {heroStat(
          "Avg Margin",
          form.summary.avg_margin?.toString() ?? "--",
          "#ffd28f"
        )}
      </div>

      <div
        style={{
          color: "#b8c4ef",
          fontSize: 13,
          lineHeight: 1.6
        }}
      >
        Provider-backed recent results are limited to the available scores window, so
        some teams may show fewer than five games.
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {form.recent_results.length ? (
          form.recent_results.map((result) => resultCard(result))
        ) : (
          <div style={{ color: "#9ba4cc" }}>No recent completed games returned.</div>
        )}
      </div>
    </div>
  );
}

function sportsbookCard(bookmaker: Bookmaker, detail: GameDetailResponse) {
  const game = detail.game;

  return (
    <div
      key={bookmaker.key}
      style={{
        padding: 18,
        borderRadius: 20,
        background: "rgba(255, 255, 255, 0.04)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        display: "grid",
        gap: 12
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12
        }}
      >
        <div style={{ color: "#fff7fb", fontWeight: 800 }}>{bookmaker.title}</div>
        <div style={{ color: "#49e7ff", fontSize: 12 }}>U.S. Book</div>
      </div>

      <div style={{ color: "#c7d0f6", fontSize: 13, lineHeight: 1.6 }}>
        <div>
          Moneyline:{" "}
          {formatBookmakerMarket(
            bookmaker.markets.moneyline,
            "moneyline",
            game.home_team,
            game.away_team
          )}
        </div>
        <div>
          Spread:{" "}
          {formatBookmakerMarket(
            bookmaker.markets.spread,
            "spread",
            game.home_team,
            game.away_team
          )}
        </div>
        <div>
          Total:{" "}
          {formatBookmakerMarket(
            bookmaker.markets.total,
            "total",
            game.home_team,
            game.away_team
          )}
        </div>
      </div>
    </div>
  );
}

export default async function GameDetailPage({ params }: GamePageProps) {
  const { sportKey, gameId } = await params;
  const detail = await getGameDetails(sportKey, gameId);
  const game = detail.game;

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "28px 18px 64px"
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: 1380,
          margin: "0 auto",
          display: "grid",
          gap: 24
        }}
      >
        <Link
          href={`/?league=${detail.sport.key}`}
          style={{
            color: "#49e7ff",
            fontSize: 14,
            fontWeight: 700,
            textDecoration: "none"
          }}
        >
          {"<-"} Back to {detail.sport.short_title}
        </Link>

        {detailShell(
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 22,
              padding: 28
            }}
          >
            <div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 12px",
                  borderRadius: 999,
                  background: "rgba(73, 231, 255, 0.14)",
                  border: "1px solid rgba(73, 231, 255, 0.24)",
                  color: "#adf8ff",
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase"
                }}
              >
                {detail.sport.title} Deep Dive
              </div>

              <h1
                style={{
                  margin: "18px 0 10px",
                  color: "#fff7fb",
                  fontFamily: "var(--font-display), 'Avenir Next', sans-serif",
                  fontSize: "clamp(2.6rem, 6vw, 5rem)",
                  lineHeight: 0.95,
                  letterSpacing: "-0.05em"
                }}
              >
                {game.away_team}
                <br />
                at {game.home_team}
              </h1>

              <p
                style={{
                  margin: 0,
                  color: "#d9d3ff",
                  fontSize: 17,
                  lineHeight: 1.7
                }}
              >
                {formatCommenceTime(game.commence_time)}
              </p>

              <p
                style={{
                  margin: "16px 0 0",
                  color: "#b7c4ef",
                  lineHeight: 1.7
                }}
              >
                Updated {formatBoardUpdatedTime(detail.generated_at)}. This page layers
                current odds, book-by-book comparisons, line range analytics, and
                recent team results into one cleaner betting workflow.
              </p>
            </div>

            <div
              style={{
                display: "grid",
                gap: 16
              }}
            >
              {heroStat(
                "Best Moneyline",
                getBestOfferText(game.market_stats.moneyline, "No line"),
                "#49e7ff"
              )}
              {heroStat(
                "Best Spread",
                getBestOfferText(game.market_stats.spread, "No line"),
                "#ff76c1"
              )}
              {heroStat(
                "Best Total",
                getBestOfferText(game.market_stats.total, "No line"),
                "#ffd28f"
              )}
            </div>
          </div>
        )}

        {detailShell(
          <div
            style={{
              padding: 24,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 18
            }}
          >
            {marketCard("Moneyline Consensus", game.market_stats.moneyline, "#49e7ff")}
            {marketCard("Spread Consensus", game.market_stats.spread, "#ff76c1")}
            {marketCard("Total Consensus", game.market_stats.total, "#ffd28f")}
            {rangeCard(
              "Spread Range",
              game.away_team,
              game.home_team,
              detail.line_analytics.spread_range[game.away_team],
              detail.line_analytics.spread_range[game.home_team]
            )}
            {totalRangeCard(
              detail.line_analytics.total_range.over,
              detail.line_analytics.total_range.under
            )}
            <div
              style={{
                padding: 18,
                borderRadius: 20,
                background:
                  "linear-gradient(135deg, rgba(255, 76, 181, 0.14), rgba(73, 231, 255, 0.12))",
                border: "1px solid rgba(255, 255, 255, 0.08)"
              }}
            >
              <div
                style={{
                  color: "#ff9ccf",
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.14em",
                  marginBottom: 10,
                  textTransform: "uppercase"
                }}
              >
                Verified Users
              </div>
              <div
                style={{
                  color: "#fff7fb",
                  fontSize: 18,
                  fontWeight: 800,
                  marginBottom: 10
                }}
              >
                Handle, tickets, and tracked history
              </div>
              <div style={{ color: "#d9d3ff", fontSize: 14, lineHeight: 1.6 }}>
                {detail.verified_user_stats.message}
              </div>
            </div>
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 24
          }}
        >
          {detailShell(
            <div style={{ padding: 24 }}>
              {teamFormCard(game.away_team, detail.team_form[game.away_team], "#49e7ff")}
            </div>
          )}
          {detailShell(
            <div style={{ padding: 24 }}>
              {teamFormCard(game.home_team, detail.team_form[game.home_team], "#ff76c1")}
            </div>
          )}
        </div>

        {detailShell(
          <div style={{ padding: 24, display: "grid", gap: 18 }}>
            <div>
              <div
                style={{
                  color: "#49e7ff",
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: "0.14em",
                  marginBottom: 8,
                  textTransform: "uppercase"
                }}
              >
                Sportsbook Comparison
              </div>
              <h2
                style={{
                  margin: 0,
                  color: "#fff7fb",
                  fontFamily: "var(--font-display), 'Avenir Next', sans-serif",
                  fontSize: "clamp(1.8rem, 4vw, 2.5rem)"
                }}
              >
                DraftKings, FanDuel, BetMGM, and friends
              </h2>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                gap: 16
              }}
            >
              {game.bookmakers.map((bookmaker) => sportsbookCard(bookmaker, detail))}
            </div>
          </div>
        )}

        {detail.notes.length ? (
          detailShell(
            <div style={{ padding: 24, display: "grid", gap: 10 }}>
              <div
                style={{
                  color: "#ffd28f",
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase"
                }}
              >
                Notes
              </div>
              {detail.notes.map((note) => (
                <div key={note} style={{ color: "#d9d3ff", lineHeight: 1.6 }}>
                  {note}
                </div>
              ))}
            </div>
          )
        ) : null}
      </section>
    </main>
  );
}

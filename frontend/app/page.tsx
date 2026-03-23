import Link from "next/link";
import type { ReactNode } from "react";

import {
  BASE_URL,
  type MarketOffer,
  type OddsBoardResponse,
  getBestOfferText,
  getOddsBoard,
  formatBoardUpdatedTime,
  formatCommenceTime,
  summarizeBookmakers
} from "../lib/shark-odds";

export const dynamic = "force-dynamic";

type HomePageProps = {
  searchParams?: Promise<{
    league?: string | string[];
  }>;
};

function shellCard(children: ReactNode) {
  return (
    <div
      style={{
        background:
          "linear-gradient(180deg, rgba(22, 16, 48, 0.92), rgba(10, 11, 28, 0.9))",
        border: "1px solid rgba(102, 232, 255, 0.18)",
        borderRadius: 28,
        boxShadow:
          "0 24px 60px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.04)",
        backdropFilter: "blur(18px)"
      }}
    >
      {children}
    </div>
  );
}

function statCard(label: string, value: string, accent: string) {
  return (
    <div
      style={{
        padding: 22,
        borderRadius: 22,
        background: "rgba(255, 255, 255, 0.04)",
        border: "1px solid rgba(255, 255, 255, 0.08)"
      }}
    >
      <div
        style={{
          color: accent,
          fontSize: 12,
          fontWeight: 800,
          letterSpacing: "0.14em",
          marginBottom: 10,
          textTransform: "uppercase"
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: "#fff7fb",
          fontFamily: "var(--font-display), 'Avenir Next', sans-serif",
          fontSize: 30,
          fontWeight: 700
        }}
      >
        {value}
      </div>
    </div>
  );
}

function leagueTab(
  label: string,
  href: string,
  isActive: boolean,
  count: number | string
) {
  return (
    <Link
      href={href}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 16px",
        borderRadius: 999,
        border: isActive
          ? "1px solid rgba(255, 76, 181, 0.52)"
          : "1px solid rgba(255, 255, 255, 0.08)",
        background: isActive
          ? "linear-gradient(90deg, rgba(255, 76, 181, 0.22), rgba(73, 231, 255, 0.2))"
          : "rgba(255, 255, 255, 0.04)",
        color: "#fff7fb",
        fontSize: 14,
        fontWeight: 700,
        letterSpacing: "0.02em",
        textDecoration: "none"
      }}
    >
      <span>{label}</span>
      <span
        style={{
          padding: "3px 8px",
          borderRadius: 999,
          background: "rgba(8, 8, 20, 0.35)",
          color: isActive ? "#49e7ff" : "#ffa8da",
          fontSize: 12
        }}
      >
        {count}
      </span>
    </Link>
  );
}

function marketSnapshot(title: string, offers: MarketOffer[], accent: string) {
  return (
    <div
      style={{
        padding: 16,
        borderRadius: 18,
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
          marginBottom: 10,
          textTransform: "uppercase"
        }}
      >
        {title}
      </div>
      <div
        style={{
          color: "#fff7fb",
          fontWeight: 800,
          marginBottom: 6
        }}
      >
        {getBestOfferText(offers, "No line")}
      </div>
      {offers[0] ? (
        <div
          style={{
            color: "#c5d4ff",
            fontSize: 13,
            lineHeight: 1.5
          }}
        >
          Best at {summarizeBookmakers(offers[0].best_bookmakers)}
        </div>
      ) : (
        <div style={{ color: "#8d96b8", fontSize: 13 }}>No line available yet.</div>
      )}
    </div>
  );
}

function verifiedPreviewCard() {
  return (
    <div
      style={{
        padding: 18,
        borderRadius: 20,
        background:
          "linear-gradient(135deg, rgba(255, 76, 181, 0.14), rgba(73, 231, 255, 0.12))",
        border: "1px solid rgba(255, 255, 255, 0.1)"
      }}
    >
      <div
        style={{
          color: "#ffa8da",
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: "0.14em",
          marginBottom: 10,
          textTransform: "uppercase"
        }}
      >
        Verified Bettor Mode
      </div>
      <div
        style={{
          color: "#fff7fb",
          fontSize: 18,
          fontWeight: 800,
          marginBottom: 8
        }}
      >
        Handle, tickets, history, and connected-book tracking
      </div>
      <div
        style={{
          color: "#d9d3ff",
          fontSize: 14,
          lineHeight: 1.6
        }}
      >
        The UI is designed for it, but the live app still needs auth, linked
        sportsbook accounts, and storage before those stats can be verified.
      </div>
    </div>
  );
}

export default async function HomePage({ searchParams }: HomePageProps) {
  let board: OddsBoardResponse | null = null;
  let loadError = "";

  try {
    board = await getOddsBoard();
  } catch (error) {
    loadError =
      error instanceof Error ? error.message : "Unable to load live odds.";
  }

  const resolvedParams = (await searchParams) ?? {};
  const leagueParam = Array.isArray(resolvedParams.league)
    ? resolvedParams.league[0]
    : resolvedParams.league;

  const sports = board?.sports ?? [];
  const totalGames = sports.reduce((count, sport) => count + sport.game_count, 0);
  const selectedLeague =
    leagueParam && sports.some((sport) => sport.key === leagueParam)
      ? leagueParam
      : "all";
  const filteredSports =
    selectedLeague === "all"
      ? sports
      : sports.filter((sport) => sport.key === selectedLeague);

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
        {shellCard(
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
                  background: "rgba(255, 76, 181, 0.14)",
                  border: "1px solid rgba(255, 76, 181, 0.24)",
                  color: "#ffc1e8",
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase"
                }}
              >
                Miami Vice Board
              </div>

              <h1
                style={{
                  margin: "18px 0 12px",
                  color: "#fff7fb",
                  fontFamily: "var(--font-display), 'Avenir Next', sans-serif",
                  fontSize: "clamp(2.7rem, 6vw, 5.4rem)",
                  lineHeight: 0.95,
                  letterSpacing: "-0.05em"
                }}
              >
                Shark Odds
              </h1>

              <p
                style={{
                  margin: 0,
                  maxWidth: 760,
                  color: "#d9d3ff",
                  fontSize: 18,
                  lineHeight: 1.7
                }}
              >
                A stats-lover&apos;s dream board for NCAA men&apos;s basketball, NBA,
                MLB, and NHL. Sort by league, skim the clean card view, then click
                into any game for deeper betting analytics.
              </p>

              <div
                style={{
                  marginTop: 22,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 12
                }}
              >
                {leagueTab("All Leagues", "/", selectedLeague === "all", totalGames)}
                {sports.map((sport) => (
                  <span key={sport.key}>
                    {leagueTab(
                      sport.short_title,
                      `/?league=${sport.key}`,
                      selectedLeague === sport.key,
                      sport.game_count
                    )}
                  </span>
                ))}
              </div>

              <div
                style={{
                  marginTop: 24,
                  padding: 20,
                  borderRadius: 22,
                  background:
                    "linear-gradient(135deg, rgba(73, 231, 255, 0.18), rgba(255, 76, 181, 0.16))",
                  border: "1px solid rgba(255, 255, 255, 0.1)"
                }}
              >
                <div
                  style={{
                    color: "#49e7ff",
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: "0.16em",
                    marginBottom: 8,
                    textTransform: "uppercase"
                  }}
                >
                  Live Status
                </div>

                <div
                  style={{
                    color: "#fff7fb",
                    fontFamily: "var(--font-display), 'Avenir Next', sans-serif",
                    fontSize: "clamp(1.3rem, 3vw, 2.25rem)",
                    fontWeight: 700
                  }}
                >
                  {board?.configured
                    ? `${totalGames} live and upcoming games from ${board.bookmaker_count ?? 0} U.S. books`
                    : "Backend setup still needed"}
                </div>

                <p
                  style={{
                    margin: "10px 0 0",
                    color: "#ebe8ff",
                    lineHeight: 1.6
                  }}
                >
                  {loadError
                    ? `${loadError} Render apps sometimes need a few seconds to wake up.`
                    : board?.configured
                      ? `Updated ${formatBoardUpdatedTime(board.generated_at)} from ${BASE_URL}/api/odds/board using ${board.bookmakers ?? "draftkings,fanduel,betmgm"}.`
                      : board?.message ??
                        "Live odds will appear here once the backend is configured."}
                </p>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gap: 16
              }}
            >
              {statCard("Leagues", `${sports.length || 4}`, "#49e7ff")}
              {statCard("Games", `${totalGames}`, "#ff76c1")}
              {statCard(
                "Sportsbooks",
                `${board?.bookmaker_count ?? 0}`,
                "#ffd28f"
              )}
              {statCard("Priority Books", "DK / FD / MGM", "#9ff7b8")}
            </div>
          </div>
        )}

        {board?.split_stats_note ? (
          shellCard(
            <div
              style={{
                padding: 20,
                color: "#ffd9a7",
                lineHeight: 1.6
              }}
            >
              {board.split_stats_note}
            </div>
          )
        ) : null}

        {board?.errors?.length ? (
          shellCard(
            <div
              style={{
                padding: 20,
                color: "#ffc3db",
                lineHeight: 1.6
              }}
            >
              Some sports could not load right now: {board.errors.join(" | ")}
            </div>
          )
        ) : null}

        {verifiedPreviewCard()}

        <div
          style={{
            display: "grid",
            gap: 24
          }}
        >
          {filteredSports.map((sport) => (
            <div key={sport.key}>
              {shellCard(
                <section
                style={{
                  padding: 24
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    marginBottom: 18
                  }}
                >
                  <div>
                    <div
                      style={{
                        color: "#49e7ff",
                        fontSize: 12,
                        fontWeight: 800,
                        letterSpacing: "0.14em",
                        marginBottom: 6,
                        textTransform: "uppercase"
                      }}
                    >
                      {sport.short_title}
                    </div>
                    <h2
                      style={{
                        margin: 0,
                        color: "#fff7fb",
                        fontFamily: "var(--font-display), 'Avenir Next', sans-serif",
                        fontSize: "clamp(1.8rem, 4vw, 2.6rem)"
                      }}
                    >
                      {sport.title}
                    </h2>
                  </div>

                  <div
                    style={{
                      color: "#d9d3ff",
                      fontSize: 15
                    }}
                  >
                    {sport.game_count} games
                  </div>
                </div>

                {sport.error ? (
                  <div
                    style={{
                      borderRadius: 18,
                      padding: 18,
                      background: "rgba(255, 76, 181, 0.08)",
                      border: "1px solid rgba(255, 76, 181, 0.18)",
                      color: "#ffc3db"
                    }}
                  >
                    {sport.error}
                  </div>
                ) : null}

                {!sport.error && !sport.games.length ? (
                  <div
                    style={{
                      borderRadius: 18,
                      padding: 18,
                      background: "rgba(255, 255, 255, 0.04)",
                      color: "#b7b9d9"
                    }}
                  >
                    No games are available for this league right now.
                  </div>
                ) : null}

                {!!sport.games.length ? (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))",
                      gap: 18
                    }}
                  >
                    {sport.games.map((game) => (
                      <article
                        key={game.id}
                        style={{
                          display: "grid",
                          gap: 16,
                          padding: 18,
                          borderRadius: 22,
                          background:
                            "linear-gradient(180deg, rgba(17, 15, 36, 0.94), rgba(12, 10, 28, 0.9))",
                          border: "1px solid rgba(255, 255, 255, 0.08)"
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            justifyContent: "space-between",
                            gap: 12
                          }}
                        >
                          <div>
                            <div
                              style={{
                                color: "#ff76c1",
                                fontSize: 11,
                                fontWeight: 800,
                                letterSpacing: "0.14em",
                                marginBottom: 8,
                                textTransform: "uppercase"
                              }}
                            >
                              {formatCommenceTime(game.commence_time)}
                            </div>
                            <div
                              style={{
                                color: "#fff7fb",
                                fontFamily:
                                  "var(--font-display), 'Avenir Next', sans-serif",
                                fontSize: 24,
                                fontWeight: 700,
                                lineHeight: 1.15
                              }}
                            >
                              {game.away_team}
                              <br />
                              at {game.home_team}
                            </div>
                          </div>

                          <div
                            style={{
                              color: "#b9c8f0",
                              fontSize: 13,
                              textAlign: "right"
                            }}
                          >
                            <div>{game.bookmakers_available} books</div>
                            <div>Tap for deep dive</div>
                          </div>
                        </div>

                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                            gap: 12
                          }}
                        >
                          {marketSnapshot(
                            "Moneyline",
                            game.market_stats.moneyline,
                            "#49e7ff"
                          )}
                          {marketSnapshot(
                            "Spread",
                            game.market_stats.spread,
                            "#ff76c1"
                          )}
                          {marketSnapshot(
                            "Total",
                            game.market_stats.total,
                            "#ffd28f"
                          )}
                        </div>

                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 12,
                            flexWrap: "wrap"
                          }}
                        >
                          <div
                            style={{
                              color: "#d9d3ff",
                              fontSize: 13,
                              lineHeight: 1.6
                            }}
                          >
                            Game page adds line ranges, recent form, book-by-book
                            markets, and the verified-user tracking shell.
                          </div>

                          <Link
                            href={`/games/${sport.key}/${game.id}`}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              padding: "12px 16px",
                              borderRadius: 14,
                              background:
                                "linear-gradient(90deg, #49e7ff 0%, #ff4cb5 100%)",
                              color: "#12091f",
                              fontSize: 14,
                              fontWeight: 800,
                              textDecoration: "none"
                            }}
                          >
                            Open analytics
                          </Link>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : null}
                </section>
              )}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

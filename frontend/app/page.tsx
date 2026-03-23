type MarketOutcome = {
  name: string;
  price: number | null;
  point: number | null;
};

type MarketOffer = {
  name: string;
  best_price: number | null;
  best_bookmakers: string[];
  average_price: number | null;
  book_count: number;
  consensus_point: number | null;
  point_frequency: number;
};

type Bookmaker = {
  key: string;
  title: string;
  last_update: string | null;
  markets: {
    moneyline: MarketOutcome[];
    spread: MarketOutcome[];
    total: MarketOutcome[];
  };
};

type GameCard = {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers_available: number;
  bookmakers: Bookmaker[];
  market_stats: {
    moneyline: MarketOffer[];
    spread: MarketOffer[];
    total: MarketOffer[];
  };
};

type SportBoard = {
  key: string;
  title: string;
  short_title: string;
  game_count: number;
  games: GameCard[];
  error?: string;
};

type OddsBoardResponse = {
  configured: boolean;
  generated_at: string;
  regions?: string;
  message?: string;
  sport_count?: number;
  game_count?: number;
  bookmaker_count?: number;
  split_stats_supported?: boolean;
  split_stats_note?: string;
  errors?: string[];
  sports: SportBoard[];
};

const BASE_URL = "https://shark-odds-1.onrender.com";

export const dynamic = "force-dynamic";

async function getOddsBoard(): Promise<OddsBoardResponse> {
  const response = await fetch(`${BASE_URL}/api/odds/board`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("Failed to load the multi-sport odds board.");
  }

  return response.json();
}

function formatAmericanOdds(price: number | null) {
  if (price === null || price === undefined) {
    return "--";
  }

  const rounded = Math.round(price);
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

function formatPoint(point: number | null) {
  if (point === null || point === undefined) {
    return "--";
  }

  return point > 0 ? `+${point}` : `${point}`;
}

function formatCommenceTime(value: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function summarizeBookmakers(bookmakers: string[]) {
  if (!bookmakers.length) {
    return "No book";
  }

  if (bookmakers.length <= 2) {
    return bookmakers.join(", ");
  }

  return `${bookmakers.slice(0, 2).join(", ")} +${bookmakers.length - 2} more`;
}

function statCard(label: string, value: string, accent?: string) {
  return (
    <div
      style={{
        background: "rgba(255, 255, 255, 0.06)",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        borderRadius: 20,
        padding: "20px 22px",
        boxShadow: "0 18px 45px rgba(0, 0, 0, 0.22)",
        backdropFilter: "blur(10px)"
      }}
    >
      <div
        style={{
          marginBottom: 10,
          color: accent ?? "#8ccfe8",
          fontSize: 13,
          letterSpacing: "0.14em",
          textTransform: "uppercase"
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: "#ffffff",
          fontSize: 28,
          fontWeight: 700
        }}
      >
        {value}
      </div>
    </div>
  );
}

function marketSnapshot(title: string, offers: MarketOffer[]) {
  return (
    <div
      style={{
        background: "rgba(255, 255, 255, 0.04)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: 16,
        padding: 16
      }}
    >
      <div
        style={{
          color: "#7ccfe7",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.12em",
          marginBottom: 12,
          textTransform: "uppercase"
        }}
      >
        {title}
      </div>

      {offers.length ? (
        <div
          style={{
            display: "grid",
            gap: 12
          }}
        >
          {offers.map((offer) => (
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
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12
                }}
              >
                <div style={{ color: "#ffffff", fontWeight: 700 }}>{offer.name}</div>
                <div style={{ color: "#9fe7ff", fontWeight: 700 }}>
                  Best {formatAmericanOdds(offer.best_price)}
                </div>
              </div>

              <div
                style={{
                  color: "#c4dfeb",
                  fontSize: 13,
                  lineHeight: 1.5
                }}
              >
                Best at {summarizeBookmakers(offer.best_bookmakers)}
              </div>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 10,
                  color: "#9cbfcd",
                  fontSize: 12
                }}
              >
                <span>{offer.book_count} books</span>
                <span>Avg {formatAmericanOdds(offer.average_price)}</span>
                {offer.consensus_point !== null ? (
                  <span>
                    Consensus {formatPoint(offer.consensus_point)} at{" "}
                    {offer.point_frequency} books
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ color: "#92b3c0", fontSize: 14 }}>No line available yet.</div>
      )}
    </div>
  );
}

function findOutcome(outcomes: MarketOutcome[], name: string) {
  return outcomes.find((outcome) => outcome.name === name);
}

function formatBookmakerMarket(
  outcomes: MarketOutcome[],
  type: "moneyline" | "spread" | "total",
  homeTeam: string,
  awayTeam: string
) {
  if (!outcomes.length) {
    return "No line";
  }

  if (type === "moneyline") {
    const away = findOutcome(outcomes, awayTeam);
    const home = findOutcome(outcomes, homeTeam);
    return `${awayTeam} ${formatAmericanOdds(away?.price ?? null)} | ${homeTeam} ${formatAmericanOdds(home?.price ?? null)}`;
  }

  if (type === "spread") {
    const away = findOutcome(outcomes, awayTeam);
    const home = findOutcome(outcomes, homeTeam);
    return `${awayTeam} ${formatPoint(away?.point ?? null)} (${formatAmericanOdds(
      away?.price ?? null
    )}) | ${homeTeam} ${formatPoint(home?.point ?? null)} (${formatAmericanOdds(
      home?.price ?? null
    )})`;
  }

  const over = findOutcome(outcomes, "Over");
  const under = findOutcome(outcomes, "Under");
  return `Over ${formatPoint(over?.point ?? null)} (${formatAmericanOdds(
    over?.price ?? null
  )}) | Under ${formatPoint(under?.point ?? null)} (${formatAmericanOdds(
    under?.price ?? null
  )})`;
}

function bookmakerCard(bookmaker: Bookmaker, game: GameCard) {
  return (
    <article
      key={bookmaker.key}
      style={{
        background: "rgba(255, 255, 255, 0.04)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: 18,
        padding: 16,
        display: "grid",
        gap: 12
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
        <div style={{ color: "#ffffff", fontWeight: 800, fontSize: 16 }}>
          {bookmaker.title}
        </div>
        <div
          style={{
            color: "#88b4c7",
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.08em"
          }}
        >
          Sportsbook
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gap: 10,
          color: "#d7edf6",
          fontSize: 13,
          lineHeight: 1.5
        }}
      >
        <div>
          <div style={{ color: "#7ccfe7", marginBottom: 4 }}>Moneyline</div>
          <div>
            {formatBookmakerMarket(
              bookmaker.markets.moneyline,
              "moneyline",
              game.home_team,
              game.away_team
            )}
          </div>
        </div>

        <div>
          <div style={{ color: "#7ccfe7", marginBottom: 4 }}>Spread</div>
          <div>
            {formatBookmakerMarket(
              bookmaker.markets.spread,
              "spread",
              game.home_team,
              game.away_team
            )}
          </div>
        </div>

        <div>
          <div style={{ color: "#7ccfe7", marginBottom: 4 }}>Total</div>
          <div>
            {formatBookmakerMarket(
              bookmaker.markets.total,
              "total",
              game.home_team,
              game.away_team
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

export default async function HomePage() {
  let board: OddsBoardResponse | null = null;
  let loadError = "";

  try {
    board = await getOddsBoard();
  } catch (error) {
    loadError =
      error instanceof Error ? error.message : "Unable to load live odds.";
  }

  const sports = board?.sports ?? [];
  const totalGames = sports.reduce((count, sport) => count + sport.game_count, 0);

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "32px 20px 60px"
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: 1320,
          margin: "0 auto",
          display: "grid",
          gap: 24
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 24
          }}
        >
          <div
            style={{
              background: "rgba(255, 255, 255, 0.07)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              borderRadius: 28,
              padding: 32,
              boxShadow: "0 24px 60px rgba(0, 0, 0, 0.28)",
              backdropFilter: "blur(14px)"
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                borderRadius: 999,
                background: "rgba(28, 194, 255, 0.14)",
                border: "1px solid rgba(28, 194, 255, 0.24)",
                color: "#9fe7ff",
                fontSize: 13,
                fontWeight: 600
              }}
            >
              Live Sportsbook Board
            </div>

            <h1
              style={{
                margin: "18px 0 14px",
                fontSize: "clamp(2.3rem, 5vw, 4.8rem)",
                lineHeight: 1,
                letterSpacing: "-0.04em"
              }}
            >
              Shark Odds
            </h1>

            <p
              style={{
                margin: 0,
                maxWidth: 720,
                color: "#c8e6f2",
                fontSize: 18,
                lineHeight: 1.7
              }}
            >
              Compare NCAA men&apos;s basketball, NBA, MLB, and NHL lines across
              every sportsbook returned by the API, with best-price and market
              consensus stats layered on top.
            </p>

            <div
              style={{
                marginTop: 28,
                padding: 24,
                borderRadius: 24,
                background: "linear-gradient(135deg, #0e2433, #13384e)",
                border: "1px solid rgba(159, 231, 255, 0.16)"
              }}
            >
              <div
                style={{
                  marginBottom: 10,
                  color: "#7ccfe7",
                  fontSize: 12,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase"
                }}
              >
                Board Status
              </div>

              <div
                style={{
                  color: "#ffffff",
                  fontSize: "clamp(1.4rem, 3vw, 2.3rem)",
                  fontWeight: 800
                }}
              >
                {board?.configured
                  ? `${totalGames} games, ${board.bookmaker_count ?? 0} books`
                  : "Backend needs one odds API key"}
              </div>

              <p
                style={{
                  margin: "12px 0 0",
                  color: "#d5eef8",
                  lineHeight: 1.7
                }}
              >
                {loadError
                  ? `${loadError} Render apps sometimes need a few seconds to wake up.`
                  : board?.configured
                    ? `Updated ${formatCommenceTime(board.generated_at)} from ${BASE_URL}/api/odds/board using regions ${board.regions ?? "us,us2"}.`
                    : board?.message ??
                      "Live odds will appear here once the backend is configured."}
              </p>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gap: 18
            }}
          >
            {statCard("Leagues", `${sports.length || 4}`)}
            {statCard("Games", `${totalGames}`)}
            {statCard("Sportsbooks", `${board?.bookmaker_count ?? 0}`)}
            {statCard(
              "Split Data",
              board?.split_stats_supported ? "Live" : "Not Wired",
              board?.split_stats_supported ? "#9fe7ff" : "#ffd7a8"
            )}
          </div>
        </div>

        {board?.split_stats_note ? (
          <div
            style={{
              background: "rgba(255, 191, 122, 0.1)",
              border: "1px solid rgba(255, 191, 122, 0.22)",
              borderRadius: 20,
              padding: 18,
              color: "#ffe1bb",
              lineHeight: 1.6
            }}
          >
            {board.split_stats_note}
          </div>
        ) : null}

        {board?.errors?.length ? (
          <div
            style={{
              background: "rgba(255, 154, 122, 0.1)",
              border: "1px solid rgba(255, 154, 122, 0.22)",
              borderRadius: 20,
              padding: 18,
              color: "#ffd7cb",
              lineHeight: 1.6
            }}
          >
            Some sports could not load right now:
            <div style={{ marginTop: 8 }}>{board.errors.join(" | ")}</div>
          </div>
        ) : null}

        <div
          style={{
            display: "grid",
            gap: 24
          }}
        >
          {sports.map((sport) => (
            <section
              key={sport.key}
              style={{
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: 26,
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
                      color: "#9fe7ff",
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      marginBottom: 6
                    }}
                  >
                    {sport.short_title}
                  </div>
                  <h2
                    style={{
                      margin: 0,
                      color: "#ffffff",
                      fontSize: 30
                    }}
                  >
                    {sport.title}
                  </h2>
                </div>

                <div
                  style={{
                    color: "#c5e4ef",
                    fontSize: 15
                  }}
                >
                  {sport.game_count} games
                </div>
              </div>

              {sport.error ? (
                <div
                  style={{
                    color: "#ffd7cb",
                    background: "rgba(255, 154, 122, 0.08)",
                    border: "1px solid rgba(255, 154, 122, 0.2)",
                    borderRadius: 16,
                    padding: 16
                  }}
                >
                  {sport.error}
                </div>
              ) : null}

              {!sport.error && !sport.games.length ? (
                <div
                  style={{
                    color: "#9abecb",
                    background: "rgba(255, 255, 255, 0.03)",
                    borderRadius: 16,
                    padding: 18
                  }}
                >
                  No games are available for this league right now.
                </div>
              ) : null}

              {!!sport.games.length ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                    gap: 18
                  }}
                >
                  {sport.games.map((game) => (
                    <article
                      key={game.id}
                      style={{
                        background: "rgba(8, 20, 29, 0.78)",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        borderRadius: 22,
                        padding: 18,
                        display: "grid",
                        gap: 16
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
                              color: "#9fe7ff",
                              fontSize: 12,
                              fontWeight: 700,
                              letterSpacing: "0.12em",
                              textTransform: "uppercase",
                              marginBottom: 8
                            }}
                          >
                            {formatCommenceTime(game.commence_time)}
                          </div>
                          <div
                            style={{
                              color: "#ffffff",
                              fontSize: 21,
                              fontWeight: 800,
                              lineHeight: 1.25
                            }}
                          >
                            {game.away_team} at {game.home_team}
                          </div>
                        </div>

                        <div
                          style={{
                            color: "#95b7c6",
                            fontSize: 13,
                            textAlign: "right"
                          }}
                        >
                          <div>{game.bookmakers_available} books</div>
                          <div>All listed</div>
                        </div>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                          gap: 12
                        }}
                      >
                        {marketSnapshot("Moneyline", game.market_stats.moneyline)}
                        {marketSnapshot("Spread", game.market_stats.spread)}
                        {marketSnapshot("Total", game.market_stats.total)}
                      </div>

                      <details
                        style={{
                          background: "rgba(255, 255, 255, 0.03)",
                          border: "1px solid rgba(255, 255, 255, 0.08)",
                          borderRadius: 18,
                          padding: 16
                        }}
                      >
                        <summary
                          style={{
                            cursor: "pointer",
                            color: "#ffffff",
                            fontWeight: 700
                          }}
                        >
                          Compare every sportsbook for this game
                        </summary>

                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "repeat(auto-fit, minmax(240px, 1fr))",
                            gap: 14,
                            marginTop: 16
                          }}
                        >
                          {game.bookmakers.map((bookmaker) =>
                            bookmakerCard(bookmaker, game)
                          )}
                        </div>
                      </details>
                    </article>
                  ))}
                </div>
              ) : null}
            </section>
          ))}
        </div>
      </section>
    </main>
  );
}

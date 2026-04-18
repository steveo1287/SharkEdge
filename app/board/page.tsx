import { getBoardPageData, parseBoardFilters } from "@/services/odds/board-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function BoardPage() {
  const data = await getBoardPageData(
    parseBoardFilters({ league: "ALL", date: "today", status: "all" })
  );

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#0a0e27", padding: "2rem", color: "#fff" }}>
      <div style={{ maxWidth: "1400px", margin: "0 auto" }}>
        <h1 style={{ fontSize: "2.5rem", fontWeight: "bold", marginBottom: "1rem" }}>Live Odds Board</h1>
        <p style={{ color: "#888", marginBottom: "2rem" }}>
          {data.games?.length || 0} games available
        </p>

        {!data.games || data.games.length === 0 ? (
          <div style={{
            backgroundColor: "#111827",
            padding: "3rem",
            borderRadius: "8px",
            textAlign: "center",
            color: "#666"
          }}>
            <p>No games available</p>
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: "1.5rem"
          }}>
            {data.games.map((game) => (
              <div
                key={game.id}
                style={{
                  backgroundColor: "#111827",
                  border: "1px solid #1f2937",
                  borderRadius: "8px",
                  padding: "1.5rem",
                  cursor: "pointer"
                }}
              >
                <div style={{ marginBottom: "1rem" }}>
                  <div style={{ fontSize: "0.875rem", color: "#666", marginBottom: "0.5rem" }}>
                    {game.leagueKey}
                  </div>
                  <div style={{ fontSize: "1rem", fontWeight: "bold" }}>
                    {game.awayTeam.abbreviation} @ {game.homeTeam.abbreviation}
                  </div>
                  <div style={{ fontSize: "0.875rem", color: "#888", marginTop: "0.25rem" }}>
                    {game.status}
                  </div>
                </div>

                <div style={{ borderTop: "1px solid #1f2937", paddingTop: "1rem", fontSize: "0.875rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                    <span>ML: {game.moneyline.bestBook}</span>
                    <span style={{ color: "#00ff88", fontWeight: "bold" }}>
                      {game.moneyline.bestOdds ? (game.moneyline.bestOdds > 0 ? "+" : "") + game.moneyline.bestOdds : "—"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                    <span>Spread: {game.spread.bestBook}</span>
                    <span style={{ fontWeight: "bold" }}>{game.spread.lineLabel || "—"}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Total: {game.total.bestBook}</span>
                    <span style={{ color: "#00ffff", fontWeight: "bold" }}>{game.total.lineLabel || "—"}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

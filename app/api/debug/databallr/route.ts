import { diagnoseDataballrPlayerContext } from "@/services/nba/adapters/databallr-adapter";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const player = searchParams.get("player") || "LeBron James";
  const team = searchParams.get("team");
  const opponent = searchParams.get("opponent");

  const result = await diagnoseDataballrPlayerContext({
    playerName: player,
    team,
    opponent
  });

  return Response.json(result);
}

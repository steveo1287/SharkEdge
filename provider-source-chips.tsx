type GameCardProps = {
  game: {
    id: string;
    homeTeam: string;
    awayTeam: string;
    homeScore?: number | null;
    awayScore?: number | null;
    commenceTime: string;
    edge?: number | null;
    confidence?: string | null;
    bestLine?: string | null;
    reason?: string | null;
    completed?: boolean;
    status?: string;
  };
};

const TEAM_ASSETS: Record<string, { logo?: string }> = {};

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "TBD";

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit"
  });
}

function getGameState(game: GameCardProps["game"]) {
  const now = new Date();
  const start = new Date(game.commenceTime);

  if (game.completed) return "FINAL";
  if (game.status?.toLowerCase().includes("final")) return "FINAL";
  if (game.status?.toLowerCase().includes("live")) return "LIVE";
  if (now > start && now.getTime() - start.getTime() < 4 * 60 * 60 * 1000) return "LIVE";
  if (now < start) return "UPCOMING";

  return "FINAL";
}

export function GameCard({ game }: GameCardProps) {
  const state = getGameState(game);

  const home = TEAM_ASSETS[game.homeTeam] || {};
  const away = TEAM_ASSETS[game.awayTeam] || {};

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0b1220] p-4 transition hover:border-sky-400/30">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {away.logo ? <img src={away.logo} className="h-8 w-8" alt={game.awayTeam} /> : null}
          <span className="truncate font-semibold text-white">{game.awayTeam}</span>
        </div>

        <div className="text-sm text-slate-400">{state}</div>

        <div className="flex min-w-0 items-center gap-3">
          <span className="truncate font-semibold text-white">{game.homeTeam}</span>
          {home.logo ? <img src={home.logo} className="h-8 w-8" alt={game.homeTeam} /> : null}
        </div>
      </div>

      <div className="mt-2 flex justify-between text-lg font-bold text-white">
        <span>{game.awayScore ?? "-"}</span>
        <span className="text-sm text-slate-400">{formatTime(game.commenceTime)}</span>
        <span>{game.homeScore ?? "-"}</span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="font-semibold text-sky-400">{game.bestLine}</div>

        {game.edge != null ? <div className="font-bold text-green-400">+{game.edge}%</div> : null}
      </div>

      {game.reason ? <div className="mt-2 text-sm text-slate-300">{game.reason}</div> : null}

      {game.confidence ? (
        <div className="mt-2 text-xs uppercase text-slate-500">{game.confidence}</div>
      ) : null}
    </div>
  );
}

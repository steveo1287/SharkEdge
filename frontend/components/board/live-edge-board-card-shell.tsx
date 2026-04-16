import { EdgeStatusTags } from "@/components/board/edge-status-tags";
import { MlbEliteCardStrip } from "@/components/board/mlb-elite-card-strip";
import { LiveEdgeBoardCard } from "@/components/board/live-edge-board-card";

export function LiveEdgeBoardCardShell({
  game
}: {
  game: {
    qualification?: { isWinnerMarketQualified?: boolean };
    scoringBlend?: { degradedFactorBucketPenalty?: number };
    mlbEliteSnapshot?: {
      normalizedTotal?: number;
      parkWeatherDelta?: number;
      bullpenFatigueDelta?: number;
      topMicroDrivers?: Array<{ label: string; value: number; detail: string }>;
    } | null;
  };
}) {
  const dimmed = (game.scoringBlend?.degradedFactorBucketPenalty ?? 0) > 0;

  return (
    <div className={`grid gap-2 transition ${dimmed ? "opacity-60 saturate-75" : "opacity-100"}`}>
      <EdgeStatusTags
        isWinnerMarketQualified={game.qualification?.isWinnerMarketQualified}
        degradedFactorBucketPenalty={game.scoringBlend?.degradedFactorBucketPenalty}
      />
      <MlbEliteCardStrip snapshot={game.mlbEliteSnapshot ?? null} />
      <LiveEdgeBoardCard game={game as never} />
    </div>
  );
}

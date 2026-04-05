import { Card } from "@/components/ui/card";

type Props = {
  verifiedCount: number;
  totalGames: number;
  sportsbooks: number;
  freshness: string;
};

export function BoardSummaryStrip({
  verifiedCount,
  totalGames,
  sportsbooks,
  freshness
}: Props) {
  return (
    <section className="grid gap-4 md:grid-cols-4">
      <Card className="surface-panel p-5">
        <div className="label">Verified</div>
        <div className="value">{verifiedCount}</div>
      </Card>

      <Card className="surface-panel p-5">
        <div className="label">Games</div>
        <div className="value">{totalGames}</div>
      </Card>

      <Card className="surface-panel p-5">
        <div className="label">Books</div>
        <div className="value">{sportsbooks}</div>
      </Card>

      <Card className="surface-panel p-5">
        <div className="label">Freshness</div>
        <div className="value">{freshness}</div>
      </Card>
    </section>
  );
}
import { Card } from "@/components/ui/card";

type Props = {
  verifiedCount: number;
  totalGames: number;
  sportsbooks: number;
  freshness: string;
};

function SummaryTile({
  label,
  value,
  note
}: {
  label: string;
  value: string | number;
  note: string;
}) {
  return (
    <Card className="surface-panel p-5">
      <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
        {label}
      </div>
      <div className="mt-3 text-3xl font-semibold text-white">{value}</div>
      <div className="mt-2 text-sm leading-6 text-slate-400">{note}</div>
    </Card>
  );
}

export function BoardSummaryStrip({
  verifiedCount,
  totalGames,
  sportsbooks,
  freshness
}: Props) {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <SummaryTile
        label="Verified rows"
        value={verifiedCount}
        note="Rows with enough market support to lead the board."
      />
      <SummaryTile
        label="Games tracked"
        value={totalGames}
        note="All events currently flowing into the board."
      />
      <SummaryTile
        label="Sportsbooks"
        value={sportsbooks}
        note="Books currently feeding current board pricing."
      />
      <SummaryTile
        label="Freshness"
        value={freshness}
        note="Current provider-health read for the slate."
      />
    </section>
  );
}
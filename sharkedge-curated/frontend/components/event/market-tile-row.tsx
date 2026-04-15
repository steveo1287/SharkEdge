import type { MatchupDetailView } from "@/lib/types/domain";

type MarketTileRowProps = {
  detail: MatchupDetailView;
};

function Tile({
  label,
  value,
  note
}: {
  label: string;
  value: string | null | undefined;
  note: string | null | undefined;
}) {
  return (
    <div className="mobile-odds-tile">
      <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-3 text-[1.25rem] font-semibold text-white">{value ?? "--"}</div>
      <div className="mt-2 text-[11px] text-slate-400">{note ?? "Best board price"}</div>
    </div>
  );
}

export function MarketTileRow({ detail }: MarketTileRowProps) {
  return (
    <section className="grid grid-cols-3 gap-3">
      <Tile label="Moneyline" value={detail.oddsSummary?.bestMoneyline} note={detail.oddsSummary?.sourceLabel} />
      <Tile label="Spread" value={detail.oddsSummary?.bestSpread} note={detail.oddsSummary?.sourceLabel} />
      <Tile label="Total" value={detail.oddsSummary?.bestTotal} note={detail.oddsSummary?.sourceLabel} />
    </section>
  );
}


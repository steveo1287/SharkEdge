function rows(bucket: Record<string, any> | undefined) {
  return Object.entries(bucket ?? {}).map(([key, value]) => ({ key, ...(value as any) }));
}

function MiniTable({ title, bucket }: { title: string; bucket: Record<string, any> | undefined }) {
  const data = rows(bucket).slice(0, 8);
  if (!data.length) return null;
  return (
    <div className="rounded-2xl border border-slate-800 bg-black/30 p-4">
      <div className="mb-3 font-semibold text-white">{title}</div>
      <div className="space-y-2 text-sm">
        {data.map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-3 text-slate-300">
            <span className="truncate">{row.key}</span>
            <span className="text-slate-500">{row.wins}-{row.losses}-{row.pushes}</span>
            <span className={row.units >= 0 ? "text-emerald-300" : "text-rose-300"}>{row.units >= 0 ? "+" : ""}{Number(row.units ?? 0).toFixed(1)}u</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SharkTrendsSplits({ splits }: { splits?: any }) {
  if (!splits) return null;
  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <MiniTable title="By season" bucket={splits.bySeason} />
      <MiniTable title="Home / away" bucket={splits.byHomeAway} />
      <MiniTable title="Favorite / dog" bucket={splits.byFavoriteUnderdog} />
      <MiniTable title="Rest bucket" bucket={splits.byRestBucket} />
      <MiniTable title="Travel spot" bucket={splits.byTravelSpot} />
      <MiniTable title="Starter form" bucket={splits.byStarterForm} />
      <MiniTable title="Odds bucket" bucket={splits.byOddsBucket} />
      <MiniTable title="By source" bucket={splits.bySourceKey} />
    </section>
  );
}

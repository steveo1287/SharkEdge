export function SharkTrendsWarningBanner({ warnings }: { warnings?: string[] }) {
  const clean = [...new Set((warnings ?? []).filter(Boolean))];
  if (!clean.length) return null;
  return (
    <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4 text-sm text-amber-100">
      <div className="font-semibold text-amber-200">Data-quality warnings</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {clean.map((warning) => (
          <span key={warning} className="rounded-full bg-black/25 px-3 py-1 text-xs text-amber-100">
            {warning}
          </span>
        ))}
      </div>
    </div>
  );
}

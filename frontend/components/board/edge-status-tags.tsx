type EdgeStatusTagsProps = {
  isWinnerMarketQualified?: boolean;
  degradedFactorBucketPenalty?: number;
};

export function EdgeStatusTags({
  isWinnerMarketQualified = false,
  degradedFactorBucketPenalty = 0
}: EdgeStatusTagsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {isWinnerMarketQualified ? (
        <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
          High conviction winner
        </span>
      ) : (
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          Not qualified
        </span>
      )}

      {degradedFactorBucketPenalty > 0 ? (
        <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200">
          Downgraded factor bucket
        </span>
      ) : null}
    </div>
  );
}

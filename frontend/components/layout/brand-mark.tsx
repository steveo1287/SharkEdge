import { brandKit } from "@/lib/brand/brand-kit";

export function BrandMark() {
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-[1.35rem] border border-amber-300/45 bg-slate-950 shadow-panel">
        <div className="absolute inset-[2px] rounded-[1.15rem] border border-white/5 bg-gradient-to-br from-sky-500/30 via-slate-950 to-slate-950" />
        <div className="absolute left-2 top-2 h-3 w-3 rounded-full bg-amber-300/70 blur-[8px]" />
        <div className="absolute bottom-2 right-2 h-2 w-2 rounded-full bg-sky-400/80" />
        <span className="relative font-display text-lg font-bold tracking-[0.08em] text-white">
          {brandKit.shortName}
        </span>
      </div>
      <div className="min-w-0">
        <div className="font-display text-xl font-semibold tracking-tight text-white">
          Shark<span className="text-sky-400">Edge</span>
        </div>
        <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
          {brandKit.tagline}
        </div>
      </div>
    </div>
  );
}

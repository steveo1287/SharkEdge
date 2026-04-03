import Link from "next/link";

type BrandMarkProps = {
  compact?: boolean;
};

export function BrandMark({ compact = false }: BrandMarkProps) {
  return (
    <Link href="/" className="group flex items-center gap-3">
      <div
        className={
          compact
            ? "overflow-hidden rounded-[1.15rem] border border-white/10 bg-[#09111d] transition group-hover:border-sky-400/30"
            : "overflow-hidden rounded-[1.35rem] border border-white/10 bg-[#09111d] shadow-[0_18px_40px_rgba(0,0,0,0.35)] transition group-hover:border-sky-400/30"
        }
      >
        <img
          src="/brand/sharkedge-logo.jpg"
          alt="SharkEdge"
          className={compact ? "h-12 w-12 object-cover" : "h-14 w-14 object-cover"}
        />
      </div>
      <div className="min-w-0">
        <div className="font-display text-[1.48rem] font-semibold tracking-tight text-white">
          Shark<span className="text-sky-400">Edge</span>
        </div>
        <div className="text-[0.64rem] uppercase tracking-[0.32em] text-slate-500">
          Sports Intelligence OS
        </div>
      </div>
    </Link>
  );
}

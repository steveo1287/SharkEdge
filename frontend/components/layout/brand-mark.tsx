import Link from "next/link";

type BrandMarkProps = {
  compact?: boolean;
};

export function BrandMark({ compact = false }: BrandMarkProps) {
  return (
    <Link
      href="/"
      className={
        compact
          ? "group flex items-center gap-3"
          : "group flex items-start gap-4"
      }
    >
      <div
        className={
          compact
            ? "shrink-0 overflow-hidden rounded-[1.15rem] border border-white/10 bg-[#09111d] transition group-hover:border-sky-400/30"
            : "shrink-0 overflow-hidden rounded-[1.35rem] border border-white/10 bg-[#09111d] shadow-[0_18px_40px_rgba(0,0,0,0.35)] transition group-hover:border-sky-400/30"
        }
      >
        <img
          src="/brand/sharkedge-logo.jpg"
          alt="SharkEdge"
          className={compact ? "h-12 w-12 object-cover" : "h-16 w-16 object-cover"}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div
          className={
            compact
              ? "font-display text-[1.48rem] font-semibold tracking-tight text-white"
              : "font-display text-[2.1rem] font-semibold tracking-tight leading-none text-white sm:text-[2.35rem]"
          }
        >
          Shark<span className="text-sky-400">Edge</span>
        </div>

        <div
          className={
            compact
              ? "mt-1 text-[0.64rem] uppercase tracking-[0.28em] text-slate-500"
              : "mt-2 max-w-[220px] text-[0.72rem] uppercase leading-[1.45] tracking-[0.24em] text-slate-500 sm:max-w-none sm:text-[0.74rem]"
          }
        >
          <div>Sports Intelligence</div>
          <div>OS</div>
        </div>
      </div>
    </Link>
  );
}
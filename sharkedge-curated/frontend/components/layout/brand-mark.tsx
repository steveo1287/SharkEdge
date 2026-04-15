import Link from "next/link";

type BrandMarkProps = {
  compact?: boolean;
};

export function BrandMark({ compact = false }: BrandMarkProps) {
  if (compact) {
    return (
      <Link href="/" className="group flex items-center gap-3">
        <div className="shrink-0 overflow-hidden rounded-[1.15rem] border border-white/10 bg-[#09111d] transition group-hover:border-sky-400/30">
          <img
            src="/brand/sharkedge-logo.jpg"
            alt="SharkEdge"
            className="h-12 w-12 object-cover"
          />
        </div>

        <div className="min-w-0">
          <div className="font-display text-[1.48rem] font-semibold tracking-tight text-white leading-none">
            Shark<span className="text-sky-400">Edge</span>
          </div>
          <div className="mt-1 text-[0.64rem] uppercase tracking-[0.24em] text-slate-500">
            Sports Intelligence OS
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href="/"
      className="group flex items-start gap-4"
      aria-label="SharkEdge home"
    >
      <div className="shrink-0 overflow-hidden rounded-[1.5rem] bg-transparent transition group-hover:scale-[1.01]">
        <img
          src="/brand/sharkedge-logo.jpg"
          alt="SharkEdge"
          className="h-[86px] w-[86px] object-contain sm:h-[92px] sm:w-[92px]"
        />
      </div>

      <div className="min-w-0 flex-1 pt-1">
        <div className="font-display text-[2.15rem] font-semibold leading-none tracking-tight text-white sm:text-[2.35rem]">
          Shark<span className="text-sky-400">Edge</span>
        </div>

        <div className="mt-2 whitespace-nowrap text-[0.72rem] uppercase leading-none tracking-[0.28em] text-slate-400 sm:text-[0.74rem]">
          Sports Intelligence OS
        </div>
      </div>
    </Link>
  );
}
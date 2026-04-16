import Link from "next/link";

type BrandMarkProps = {
  compact?: boolean;
};

export function BrandMark({ compact = false }: BrandMarkProps) {
  if (compact) {
    return (
      <Link href="/" className="group flex items-center gap-2.5">
        <div className="shrink-0 overflow-hidden rounded-lg border border-zinc-700/50 bg-zinc-800 transition group-hover:border-zinc-600">
          <img
            src="/brand/sharkedge-logo.jpg"
            alt="SharkEdge"
            className="h-7 w-7 object-cover"
          />
        </div>
        <div className="min-w-0">
          <div className="font-display text-[0.95rem] font-semibold leading-none tracking-tight text-white">
            Shark<span className="text-blue-400">Edge</span>
          </div>
          <div className="mt-0.5 text-[0.55rem] uppercase tracking-[0.18em] text-zinc-600">
            Intelligence
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link href="/" className="group flex items-center gap-3" aria-label="SharkEdge home">
      <div className="shrink-0 overflow-hidden rounded-xl border border-zinc-700/50 bg-zinc-800 transition group-hover:border-zinc-600">
        <img
          src="/brand/sharkedge-logo.jpg"
          alt="SharkEdge"
          className="h-10 w-10 object-cover"
        />
      </div>
      <div className="min-w-0">
        <div className="font-display text-xl font-semibold leading-none tracking-tight text-white">
          Shark<span className="text-blue-400">Edge</span>
        </div>
        <div className="mt-1 text-[0.6rem] uppercase tracking-[0.2em] text-zinc-600">
          Sports Intelligence
        </div>
      </div>
    </Link>
  );
}

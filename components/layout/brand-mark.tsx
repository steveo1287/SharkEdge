import Link from "next/link";

type BrandMarkProps = {
  compact?: boolean;
};

/**
 * SHARK·EDGE wordmark.
 * Tight-tracked display. Interpunct is aqua — that dot alone is the favicon.
 */
export function BrandMark({ compact = false }: BrandMarkProps) {
  const sizeClass = compact ? "text-[15px]" : "text-[19px]";
  const subClass  = compact ? "text-[9px]"  : "text-[10px]";

  return (
    <Link href="/" className="group flex items-center gap-2.5" aria-label="SharkEdge home">
      <div className="min-w-0">
        <div
          className={`font-display ${sizeClass} font-semibold leading-none tracking-[-0.01em] text-text-primary`}
        >
          SHARK<span className="mx-[2px] text-aqua">·</span>EDGE
        </div>
        <div
          className={`mt-1 ${subClass} font-semibold uppercase tracking-[0.14em] text-bone/60`}
        >
          Terminal
        </div>
      </div>
    </Link>
  );
}

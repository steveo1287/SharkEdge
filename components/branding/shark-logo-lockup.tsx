import Link from "next/link";

import { cn } from "@/lib/utils/cn";

type SharkLogoLockupProps = {
  compact?: boolean;
  subtitle?: string;
};

export function SharkLogoLockup({
  compact = false,
  subtitle = "Live betting intelligence"
}: SharkLogoLockupProps) {
  return (
    <Link href="/" className="group inline-flex items-center gap-3" aria-label="SharkEdge home">
      <div
        className={cn(
          "relative shrink-0 overflow-hidden border border-white/10 bg-[#0c1320] shadow-[0_12px_32px_rgba(0,0,0,0.35)] transition group-hover:border-[#188cff]/30",
          compact ? "h-11 w-11 rounded-[16px]" : "h-14 w-14 rounded-[20px]"
        )}
      >
        <img
          src="/brand/sharkedge-logo.jpg"
          alt="SharkEdge"
          className="h-full w-full object-cover"
        />
      </div>

      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">{subtitle}</div>
        <div
          className={cn(
            "font-display font-semibold tracking-tight text-white",
            compact ? "text-[1.5rem] leading-none" : "text-[1.95rem] leading-none"
          )}
        >
          Shark<span className="text-[#188cff]">Edge</span>
        </div>
      </div>
    </Link>
  );
}


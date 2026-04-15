import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

type MobileTopBarProps = {
  title?: string;
  subtitle?: string;
  leftHref?: string;
  leftLabel?: string;
  rightSlot?: ReactNode;
  compact?: boolean;
};

export function MobileTopBar({
  title,
  subtitle,
  leftHref,
  leftLabel = "Back",
  rightSlot,
  compact = false
}: MobileTopBarProps) {
  return (
    <div className={cn("flex items-start justify-between gap-3", compact ? "pb-2" : "pb-3")}>
      <div className="flex min-w-0 items-start gap-3">
        {leftHref ? (
          <Link href={leftHref} className="mobile-icon-button mt-0.5" aria-label={leftLabel}>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
              <path d="M14.5 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        ) : null}
        <div className="min-w-0">
          {subtitle ? <div className="mobile-eyebrow">{subtitle}</div> : null}
          {title ? <div className={cn("font-display font-semibold tracking-tight text-white", compact ? "text-[1.2rem]" : "text-[1.4rem]")}>{title}</div> : null}
        </div>
      </div>

      {rightSlot ? <div className="flex items-center gap-2">{rightSlot}</div> : null}
    </div>
  );
}


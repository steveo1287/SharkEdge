import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Terminal atoms — the smallest visual building blocks that give SharkEdge
 * its fingerprint. Each is intentionally tiny and context-free.
 */

// ── MicroLabel ──────────────────────────────────────────────────────────────
// The 10.5px uppercase bone kicker used above every module.
type MicroLabelProps = {
  children: ReactNode;
  tone?: "bone" | "aqua" | "mint" | "crimson";
  className?: string;
};

export function MicroLabel({ children, tone = "bone", className }: MicroLabelProps) {
  const toneClass =
    tone === "aqua"    ? "text-aqua" :
    tone === "mint"    ? "text-mint" :
    tone === "crimson" ? "text-crimson" :
                         "text-bone/60";
  return (
    <span
      className={cn(
        "inline-block text-[10.5px] font-semibold uppercase tracking-[0.08em]",
        toneClass,
        className
      )}
    >
      {children}
    </span>
  );
}

// ── LiveDot ─────────────────────────────────────────────────────────────────
// Breathing aqua pulse. The single most brand-coded element.
export function LiveDot({ className }: { className?: string }) {
  return <span className={cn("live-dot", className)} aria-hidden />;
}

// ── Confidence (5-bar stepped meter) ───────────────────────────────────────
type ConfidenceProps = {
  /** 0-5 */
  level: number;
  className?: string;
};

export function Confidence({ level, className }: ConfidenceProps) {
  const clamped = Math.max(0, Math.min(5, Math.round(level)));
  return (
    <span className={cn("confidence", className)} aria-label={`Confidence ${clamped} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} data-on={n <= clamped ? "true" : undefined} />
      ))}
    </span>
  );
}

// ── NumberCell ──────────────────────────────────────────────────────────────
// Tabular mono number with sign-aware color. Default is neutral (text-primary).
// Negative/positive tones only paint the *underline*, keeping the cell quiet.
type NumberCellProps = {
  value: string | number;
  /** If "auto", positive -> mint, negative -> crimson. Otherwise forced. */
  tone?: "auto" | "neutral" | "positive" | "negative" | "aqua";
  align?: "left" | "right";
  size?: "sm" | "md" | "lg";
  prefix?: string;
  suffix?: string;
  /** When true, underlines the value with the tone color */
  underline?: boolean;
  className?: string;
};

function resolveTone(
  tone: NumberCellProps["tone"],
  numeric: number | null
): "neutral" | "positive" | "negative" | "aqua" {
  if (tone && tone !== "auto") return tone;
  if (numeric == null || Number.isNaN(numeric)) return "neutral";
  if (numeric > 0) return "positive";
  if (numeric < 0) return "negative";
  return "neutral";
}

export function NumberCell({
  value,
  tone = "neutral",
  align = "right",
  size = "md",
  prefix,
  suffix,
  underline = false,
  className
}: NumberCellProps) {
  const numeric =
    typeof value === "number"
      ? value
      : Number.parseFloat(String(value).replace(/[^\d.\-+]/g, ""));
  const resolved = resolveTone(tone, Number.isFinite(numeric) ? numeric : null);

  const toneClass =
    resolved === "positive" ? "text-mint" :
    resolved === "negative" ? "text-crimson" :
    resolved === "aqua"     ? "text-aqua" :
                              "text-text-primary";

  const underlineClass = underline
    ? resolved === "positive" ? "border-b border-mint/50" :
      resolved === "negative" ? "border-b border-crimson/50" :
      resolved === "aqua"     ? "border-b border-aqua/50" :
                                "border-b border-bone/20"
    : "";

  const sizeClass =
    size === "sm" ? "text-[12px]" :
    size === "lg" ? "text-[15px]" :
                    "text-[13px]";

  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-0.5 font-mono font-medium tabular-nums",
        sizeClass,
        toneClass,
        underlineClass,
        align === "right" ? "justify-end" : "justify-start",
        className
      )}
    >
      {prefix ? <span className="text-bone/50">{prefix}</span> : null}
      <span>{value}</span>
      {suffix ? <span className="text-bone/50">{suffix}</span> : null}
    </span>
  );
}

// ── AquaRule ────────────────────────────────────────────────────────────────
// A horizontal hairline with an aqua segment — used as a section terminator.
export function AquaRule({ className }: { className?: string }) {
  return <div className={cn("terminal-rule", className)} aria-hidden />;
}

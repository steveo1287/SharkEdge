"use client";

import { useState } from "react";

type TeamBadgeProps = {
  name: string;
  abbreviation?: string | null;
  logoUrl?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  tone?: "away" | "home" | "neutral";
};

const SIZE_CLASSES: Record<NonNullable<TeamBadgeProps["size"]>, string> = {
  sm: "h-8 w-8 text-[0.62rem]",
  md: "h-10 w-10 text-xs",
  lg: "h-12 w-12 text-sm",
  xl: "h-16 w-16 text-base",
};

const TONE_CLASSES: Record<NonNullable<TeamBadgeProps["tone"]>, string> = {
  away: "bg-slate-800 text-white ring-1 ring-white/10",
  home: "bg-slate-700 text-white ring-1 ring-white/10",
  neutral: "bg-slate-800 text-white ring-1 ring-white/10",
};

function getInitials(name: string, abbreviation?: string | null) {
  if (abbreviation?.trim()) {
    return abbreviation.trim().slice(0, 4).toUpperCase();
  }
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "TM";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
}

export function TeamBadge({
  name,
  abbreviation,
  logoUrl,
  size = "md",
  tone = "neutral",
}: TeamBadgeProps) {
  const [imgError, setImgError] = useState(false);
  const initials = getInitials(name, abbreviation);
  const sizeClass = SIZE_CLASSES[size];
  const toneClass = TONE_CLASSES[tone];

  if (logoUrl && !imgError) {
    return (
      <div
        className={`overflow-hidden rounded-full ${sizeClass} ${toneClass} shrink-0`}
        aria-label={name}
        title={name}
      >
        <img
          src={logoUrl}
          alt={name}
          className="h-full w-full object-contain p-0.5"
          loading="lazy"
          onError={() => setImgError(true)}
        />
      </div>
    );
  }

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold uppercase tracking-[0.08em] ${sizeClass} ${toneClass}`}
      aria-label={name}
      title={name}
    >
      {initials}
    </div>
  );
}

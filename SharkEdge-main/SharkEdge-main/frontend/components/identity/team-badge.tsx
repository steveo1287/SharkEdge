import { cn } from "@/lib/utils/cn";

type TeamBadgeProps = {
  name: string;
  abbreviation?: string | null;
  logoUrl?: string | null;
  size?: "sm" | "md" | "lg";
  tone?: "away" | "home" | "neutral";
};

const SIZE_CLASSES: Record<NonNullable<TeamBadgeProps["size"]>, { shell: string; image: string; text: string }> = {
  sm: {
    shell: "h-11 w-11 rounded-[1rem]",
    image: "h-[72%] w-[72%]",
    text: "text-[0.68rem]"
  },
  md: {
    shell: "h-14 w-14 rounded-[1.1rem]",
    image: "h-[74%] w-[74%]",
    text: "text-sm"
  },
  lg: {
    shell: "h-16 w-16 rounded-[1.25rem]",
    image: "h-[76%] w-[76%]",
    text: "text-base"
  }
};

const TONE_CLASSES: Record<NonNullable<TeamBadgeProps["tone"]>, string> = {
  away: "border-sky-400/18 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.18),transparent_55%),linear-gradient(180deg,rgba(8,15,25,0.98),rgba(7,13,22,0.98))]",
  home: "border-emerald-400/18 bg-[radial-gradient(circle_at_top,rgba(52,211,153,0.16),transparent_55%),linear-gradient(180deg,rgba(8,15,25,0.98),rgba(7,13,22,0.98))]",
  neutral: "border-white/10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_55%),linear-gradient(180deg,rgba(8,15,25,0.98),rgba(7,13,22,0.98))]"
};

function getInitials(name: string, abbreviation?: string | null) {
  if (abbreviation?.trim()) {
    return abbreviation.trim().slice(0, 4).toUpperCase();
  }

  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) {
    return "TM";
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
}

export function TeamBadge({
  name,
  abbreviation,
  logoUrl,
  size = "md",
  tone = "neutral"
}: TeamBadgeProps) {
  const initials = getInitials(name, abbreviation);
  const sizeClasses = SIZE_CLASSES[size];

  return (
    <div
      className={cn(
        "relative inline-flex items-center justify-center overflow-hidden border shadow-[0_14px_28px_rgba(0,0,0,0.28)]",
        sizeClasses.shell,
        TONE_CLASSES[tone]
      )}
      aria-label={name}
      title={name}
    >
      <div className="absolute inset-[1px] rounded-[inherit] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),transparent_36%)]" />
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={name}
          className={cn("relative z-10 object-contain drop-shadow-[0_6px_16px_rgba(0,0,0,0.4)]", sizeClasses.image)}
          loading="lazy"
        />
      ) : (
        <div
          className={cn(
            "relative z-10 font-display font-semibold uppercase tracking-[0.18em] text-white",
            sizeClasses.text
          )}
        >
          {initials}
        </div>
      )}
    </div>
  );
}

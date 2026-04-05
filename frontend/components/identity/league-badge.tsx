type Props = {
  league: string;
  logoUrl?: string | null;
  size?: "sm" | "md" | "lg";
};

export function LeagueBadge({
  league,
  logoUrl,
  size = "md"
}: Props) {
  const sizeMap = {
    sm: "h-6 w-6 text-[9px]",
    md: "h-8 w-8 text-[10px]",
    lg: "h-10 w-10 text-xs"
  };

  if (logoUrl) {
    return (
      <div
        className={`flex items-center justify-center rounded-full bg-slate-800 ring-1 ring-white/10 ${sizeMap[size]}`}
      >
        <img
          src={logoUrl}
          alt={league}
          className="h-full w-full object-contain"
        />
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-center rounded-full bg-slate-800 font-semibold uppercase tracking-[0.08em] text-white ring-1 ring-white/10 ${sizeMap[size]}`}
    >
      {league.slice(0, 3)}
    </div>
  );
}
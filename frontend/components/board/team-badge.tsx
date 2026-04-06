type TeamBadgeProps = {
  code: string;
  label?: string | null;
  size?: "sm" | "md" | "lg";
};

const TONES = [
  "from-sky-500/30 to-cyan-400/10 border-sky-400/25 text-sky-100",
  "from-fuchsia-500/25 to-violet-400/10 border-fuchsia-400/20 text-fuchsia-100",
  "from-emerald-500/25 to-teal-400/10 border-emerald-400/20 text-emerald-100",
  "from-amber-500/25 to-orange-400/10 border-amber-400/20 text-amber-100",
  "from-rose-500/25 to-red-400/10 border-rose-400/20 text-rose-100"
];

function hashLabel(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
}

function getTone(value: string) {
  return TONES[hashLabel(value) % TONES.length];
}

function getSizeClasses(size: TeamBadgeProps["size"]) {
  if (size === "sm") {
    return {
      shell: "h-10 w-10 text-xs",
      glow: "h-8 w-8 text-[0.62rem]"
    };
  }

  if (size === "lg") {
    return {
      shell: "h-16 w-16 text-lg",
      glow: "h-12 w-12 text-sm"
    };
  }

  return {
    shell: "h-12 w-12 text-sm",
    glow: "h-9 w-9 text-[0.72rem]"
  };
}

export function TeamBadge({ code, label, size = "md" }: TeamBadgeProps) {
  const safeCode = (code || label || "?").trim().toUpperCase().slice(0, 4);
  const tone = getTone(label || safeCode);
  const sizeClasses = getSizeClasses(size);

  return (
    <div
      className={`relative inline-flex items-center justify-center rounded-2xl border bg-gradient-to-br ${tone} ${sizeClasses.shell}`}
      title={label ?? safeCode}
      aria-label={label ?? safeCode}
    >
      <div className={`inline-flex items-center justify-center rounded-xl border border-white/10 bg-slate-950/80 font-semibold tracking-[0.18em] ${sizeClasses.glow}`}>
        {safeCode}
      </div>
    </div>
  );
}
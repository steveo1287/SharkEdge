import { cn } from "@/lib/utils/cn";

type SharkScoreRingProps = {
  score: number;
  label?: string;
  size?: "sm" | "md" | "lg";
  tone?: "brand" | "success" | "warning";
};

const SIZE_MAP = {
  sm: { box: 54, stroke: 5, text: "text-lg" },
  md: { box: 72, stroke: 6, text: "text-2xl" },
  lg: { box: 90, stroke: 7, text: "text-[2rem]" }
} as const;

const TONE_MAP = {
  brand: "#48e0d2",
  success: "#2dd36f",
  warning: "#facc15"
} as const;

export function SharkScoreRing({
  score,
  label = "SHARK",
  size = "md",
  tone = "brand"
}: SharkScoreRingProps) {
  const bounded = Math.max(0, Math.min(100, Math.round(score)));
  const { box, stroke, text } = SIZE_MAP[size];
  const radius = box / 2 - stroke * 1.5;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (bounded / 100) * circumference;

  return (
    <div className="inline-flex flex-col items-center gap-1">
      <div className="relative inline-flex items-center justify-center">
        <svg width={box} height={box} viewBox={`0 0 ${box} ${box}`} className="-rotate-90">
          <circle
            cx={box / 2}
            cy={box / 2}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={stroke}
          />
          <circle
            cx={box / 2}
            cy={box / 2}
            r={radius}
            fill="none"
            stroke={TONE_MAP[tone]}
            strokeLinecap="round"
            strokeWidth={stroke}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className={cn("font-display font-semibold tracking-tight text-white", text)}>
            {bounded}
          </div>
        </div>
      </div>
      <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{label}</div>
    </div>
  );
}


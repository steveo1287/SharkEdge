export const sharkTokens = {
  color: {
    bg: "#05070c",
    bgTop: "#0a1019",
    bgElevated: "#0c1320",
    bgCard: "#101722",
    bgCardStrong: "#131d2d",
    border: "rgba(255,255,255,0.08)",
    borderStrong: "rgba(104, 150, 255, 0.22)",
    text: "#f8fbff",
    textMuted: "#99a3b7",
    textSoft: "#677284",
    brand: "#188cff",
    brandSoft: "#48e0d2",
    success: "#2dd36f",
    warning: "#ff9b3f",
    danger: "#ff4f64",
    gold: "#d5b160"
  },
  radius: {
    card: "24px",
    hero: "30px",
    pill: "999px"
  },
  space: {
    1: "4px",
    2: "8px",
    3: "12px",
    4: "16px",
    5: "20px",
    6: "24px"
  }
} as const;

export type SharkTokens = typeof sharkTokens;


import type { Config } from "tailwindcss";

/**
 * SharkEdge — The Terminal
 * Premium dark-mode sports trading aesthetic.
 * Locked palette: ink layers + bone hairlines + aqua accent + mint/crimson signals.
 * Do not introduce additional hues without a design review.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./services/**/*.{ts,tsx}",
    "./types/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        // ── The ink stack (five surface layers) ───────────────────────────
        abyss:    "#04050A",
        ink:      "#06070A",
        surface:  "#0C0E12",
        panel:    "#131620",
        raised:   "#1A1E29",
        overlay:  "#22283A",

        // ── Hairline / bone (warm border + microlabel color) ──────────────
        bone:     "#E8DCC4",

        // ── Accent: aqua (cool) ───────────────────────────────────────────
        aqua:     "#22D3EE",
        "aqua-hot": "#00E5FF",
        "aqua-dim": "#0E7490",

        // ── Signal colors ─────────────────────────────────────────────────
        mint:     "#4AE3B5",
        crimson:  "#FF4D5E",
        signal:   "#FF3EA5",

        // ── Text ──────────────────────────────────────────────────────────
        "text-primary": "#F4F5F7",
        "text-muted":   "#8A8F9E",
        "text-dim":     "#4A4F5C",

        // ── Legacy token aliases (remapped to the new palette) ────────────
        // Keeps existing components/classes rendering without breaking.
        line:       "rgba(232, 220, 196, 0.08)",
        brand:      "#22D3EE",
        brandMuted: "#0E7490",
        premium:    "#E8DCC4",
        success:    "#4AE3B5",
        danger:     "#FF4D5E",
        muted:      "#8A8F9E"
      },
      fontFamily: {
        display: ["var(--font-display)", "Space Grotesk", "system-ui", "sans-serif"],
        body:    ["var(--font-body)", "Inter", "system-ui", "sans-serif"],
        mono:    ["var(--font-mono)", "JetBrains Mono", "ui-monospace", "monospace"]
      },
      // No drop shadows. Premium elevation comes from the 5-layer surface stack.
      boxShadow: {
        panel: "none",
        card:  "none",
        "blue-glow": "none",
        "aqua-glow": "0 0 0 1px rgba(34, 211, 238, 0.35), 0 0 24px rgba(34, 211, 238, 0.15)"
      },
      borderRadius: {
        sm:  "2px",
        md:  "6px",
        lg:  "10px",
        xl:  "14px",
        "2xl": "14px"
      },
      animation: {
        "fade-in":   "fadeIn 0.14s cubic-bezier(0.2,0,0,1)",
        "slide-up":  "slideUp 0.18s cubic-bezier(0.2,0,0,1)",
        "breathe":   "breathe 1.8s ease-in-out infinite",
        "digit-flip": "digitFlip 0.28s cubic-bezier(0.2,0,0,1)"
      },
      keyframes: {
        fadeIn:  { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        slideUp: { "0%": { opacity: "0", transform: "translateY(6px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        breathe: {
          "0%,100%": { opacity: "1", boxShadow: "0 0 0 0 rgba(34,211,238,0.35)" },
          "50%":     { opacity: "0.65", boxShadow: "0 0 0 6px rgba(34,211,238,0)" }
        },
        digitFlip: {
          "0%":   { transform: "translateY(-8%)", opacity: "0" },
          "100%": { transform: "translateY(0)",   opacity: "1" }
        }
      }
    }
  },
  plugins: []
};

export default config;

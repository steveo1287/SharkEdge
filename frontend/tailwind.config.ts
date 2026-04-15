import type { Config } from "tailwindcss";

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
        // Core surfaces — matches CSS variables
        ink:     "#09090b",
        surface: "#0f1014",
        panel:   "#131518",
        raised:  "#17191d",
        overlay: "#1c1e23",

        // Legacy compatibility
        line:      "#27272a",
        brand:     "#3b82f6",
        brandMuted:"#1e3a5f",
        premium:   "#c8993e",
        success:   "#22c55e",
        danger:    "#ef4444",
        muted:     "#71717a"
      },
      fontFamily: {
        display: ["var(--font-display)", "Space Grotesk", "system-ui", "sans-serif"],
        body:    ["var(--font-body)", "IBM Plex Sans", "system-ui", "sans-serif"],
        mono:    ["var(--font-mono)", "IBM Plex Mono", "monospace"]
      },
      boxShadow: {
        panel:  "0 1px 3px rgba(0,0,0,0.3), 0 8px 24px rgba(0,0,0,0.2)",
        card:   "0 1px 2px rgba(0,0,0,0.4)",
        "blue-glow": "0 0 20px rgba(59,130,246,0.15)"
      },
      borderRadius: {
        sm:  "6px",
        md:  "10px",
        lg:  "14px",
        xl:  "20px",
        "2xl": "24px"
      },
      animation: {
        "fade-in":   "fadeIn 0.2s ease-out",
        "slide-up":  "slideUp 0.25s ease-out"
      },
      keyframes: {
        fadeIn:  { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        slideUp: { "0%": { opacity: "0", transform: "translateY(8px)" }, "100%": { opacity: "1", transform: "translateY(0)" } }
      }
    }
  },
  plugins: []
};

export default config;

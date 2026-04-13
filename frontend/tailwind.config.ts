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
        ink: "#050a14",
        surface: "#0d1626",
        panel: "#111c2f",
        line: "#1c2b44",
        brand: "#3796ff",
        brandMuted: "#18335f",
        premium: "#c6a55b",
        success: "#24c78d",
        danger: "#e05b66",
        muted: "#8ca0c1"
      },
      boxShadow: {
        panel: "0 18px 40px rgba(0, 0, 0, 0.28)"
      },
      fontFamily: {
        display: ["var(--font-display)", "Space Grotesk", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "IBM Plex Sans", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "IBM Plex Mono", "monospace"]
      },
      backgroundImage: {
        grid: "linear-gradient(rgba(56, 86, 140, 0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(56, 86, 140, 0.14) 1px, transparent 1px)"
      }
    }
  },
  plugins: []
};

export default config;

import type { Metadata } from "next";
import { Manrope, Space_Grotesk } from "next/font/google";
import type { ReactNode } from "react";

const bodyFont = Manrope({
  subsets: ["latin"],
  variable: "--font-body"
});

const displayFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display"
});

export const metadata: Metadata = {
  title: "Shark Odds",
  description:
    "A Miami Vice-inspired sportsbook board for live odds, deep game breakdowns, and bettor-first analytics."
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${bodyFont.variable} ${displayFont.variable}`}
        style={{
          margin: 0,
          minHeight: "100vh",
          background:
            "radial-gradient(circle at top left, rgba(49, 243, 255, 0.24), transparent 30%), radial-gradient(circle at top right, rgba(255, 76, 181, 0.24), transparent 32%), linear-gradient(180deg, #1a1033 0%, #100a24 45%, #090612 100%)",
          color: "#fff7fb",
          fontFamily:
            "var(--font-body), 'Avenir Next', 'Segoe UI', sans-serif"
        }}
      >
        {children}
      </body>
    </html>
  );
}

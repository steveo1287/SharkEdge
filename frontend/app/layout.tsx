import type { Metadata } from "next";
import type { ReactNode } from "react";
import { IBM_Plex_Sans, IBM_Plex_Mono, Space_Grotesk } from "next/font/google";

import { AppShell } from "@/components/layout/app-shell";
import { brandKit } from "@/lib/brand/brand-kit";

import "./globals.css";

const fontBody = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
  display: "swap"
});

const fontDisplay = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
  display: "swap"
});

const fontMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap"
});

function getSiteUrl() {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.SITE_URL?.trim();
  if (configured) {
    try {
      return new URL(configured);
    } catch {
      return undefined;
    }
  }

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    try {
      return new URL(`https://${vercelUrl}`);
    } catch {
      return undefined;
    }
  }

  return undefined;
}

export const metadata: Metadata = {
  title: {
    default: brandKit.name,
    template: `%s | ${brandKit.name}`
  },
  metadataBase: getSiteUrl(),
  applicationName: brandKit.name,
  description: brandKit.description,
  keywords: [...brandKit.keywords],
  openGraph: {
    title: brandKit.name,
    description: brandKit.description,
    siteName: brandKit.name,
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: brandKit.name,
    description: brandKit.description
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fontBody.variable} ${fontDisplay.variable} ${fontMono.variable}`}
    >
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

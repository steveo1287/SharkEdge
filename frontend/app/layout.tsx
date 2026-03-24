import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { brandKit } from "@/lib/brand/brand-kit";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: brandKit.name,
    template: `%s | ${brandKit.name}`
  },
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
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

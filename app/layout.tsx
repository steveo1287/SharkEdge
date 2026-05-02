import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";

import { AppShell } from "@/components/layout/app-shell";
import { BetSlipProvider } from "@/components/bets/bet-slip-provider";
import { BetSlipDrawer } from "@/components/bets/bet-slip-drawer";
import { brandKit } from "@/lib/brand/brand-kit";

import "./globals.css";

const fontBody = Inter({ subsets: ["latin"], weight: ["400","500","600","700"], variable: "--font-body", display: "swap" });
const fontDisplay = Space_Grotesk({ subsets: ["latin"], weight: ["400","500","600","700"], variable: "--font-display", display: "swap" });
const fontMono = JetBrains_Mono({ subsets: ["latin"], weight: ["400","500","600"], variable: "--font-mono", display: "swap" });

function getSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.SITE_URL?.trim();
  if (configured) { try { return new URL(configured); } catch {} }
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) { try { return new URL(`https://${vercelUrl}`); } catch {} }
  return undefined;
}

const trendsCenterLabelScript = `
(function () {
  function text(el) { return (el && el.textContent ? el.textContent : '').trim(); }
  function findText(root, value) {
    return Array.prototype.find.call(root.querySelectorAll('div,h2,p'), function (el) { return text(el) === value; }) || null;
  }
  function makeTile(label, value, note) {
    var tile = document.createElement('div');
    tile.className = 'rounded-2xl border p-4 border-white/10 bg-slate-950/60';
    tile.innerHTML = '<div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">' + label + '</div>' +
      '<div class="mt-2 font-display text-2xl font-semibold text-white">' + value + '</div>' +
      '<div class="mt-2 text-xs leading-5 text-slate-400">' + note + '</div>';
    return tile;
  }
  function patchFromSnapshot(snapshot) {
    var sections = Array.prototype.filter.call(document.querySelectorAll('section'), function (section) {
      return section.textContent && section.textContent.indexOf('Trends Center') !== -1;
    });
    var section = sections[0];
    if (!section) return;

    var heading = findText(section, 'Saved-system command center');
    if (heading) heading.textContent = 'Trends Center command center';

    var subhead = Array.prototype.find.call(section.querySelectorAll('p'), function (el) {
      return text(el).indexOf('Inventory, freshness, proof gates') !== -1;
    });
    if (subhead) subhead.textContent = 'Published-system inventory, saved-row freshness, proof gates, and command queue for the systems that should become the main Trends Center product layer.';

    var activeLabel = findText(section, 'Active saved systems');
    if (activeLabel) activeLabel.textContent = 'Active published systems';

    if (activeLabel && activeLabel.parentElement) {
      var publishedActive = snapshot && snapshot.counts ? (snapshot.counts.publishedActive || snapshot.counts.active || 0) : null;
      var publishedTotal = snapshot && snapshot.counts ? (snapshot.counts.publishedTotal || snapshot.counts.total || 0) : null;
      var activeValue = activeLabel.parentElement.querySelector('.font-display');
      if (activeValue && publishedActive !== null) activeValue.textContent = String(publishedActive);
      var activeNote = activeLabel.parentElement.querySelector('.text-xs.leading-5');
      if (activeNote) activeNote.textContent = publishedActive + '/' + publishedTotal + ' published systems currently have live qualifying matches. Saved-row status is tracked separately.';
    }

    var grid = activeLabel && activeLabel.parentElement && activeLabel.parentElement.parentElement;
    if (grid && !grid.querySelector('[data-trends-center-saved-rows="true"]')) {
      var savedTotal = snapshot && snapshot.counts ? (snapshot.counts.savedTotal || 0) : 0;
      var savedActive = snapshot && snapshot.counts ? (snapshot.counts.savedActive || 0) : 0;
      var stale = snapshot && snapshot.counts ? (snapshot.counts.stale || 0) : 0;
      var neverRun = snapshot && snapshot.counts ? (snapshot.counts.neverRun || 0) : 0;
      var tile = makeTile('Saved rows', savedActive + '/' + savedTotal, stale + ' stale · ' + neverRun + ' never-run. These are saved trend rows, separate from published system inventory.');
      tile.setAttribute('data-trends-center-saved-rows', 'true');
      grid.insertBefore(tile, grid.children[1] || null);
    }

    var emptyMsg = Array.prototype.find.call(section.querySelectorAll('div'), function (el) {
      return text(el).indexOf('No saved-system command blockers') === 0;
    });
    if (emptyMsg) emptyMsg.textContent = 'No saved-row command blockers. Use proof grade, ROI, published-system activity, and current signal quality for promotion order.';
  }
  function patch() {
    fetch('/api/trends/center', { cache: 'no-store' })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (snapshot) { patchFromSnapshot(snapshot); })
      .catch(function () { patchFromSnapshot(null); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', patch);
  else patch();
  window.addEventListener('pageshow', patch);
})();
`;

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", maximumScale: 5 };

export const metadata: Metadata = {
  title: { default: brandKit.name, template: `%s | ${brandKit.name}` },
  metadataBase: getSiteUrl(),
  applicationName: brandKit.name,
  description: brandKit.description,
  keywords: [...brandKit.keywords],
  openGraph: { title: brandKit.name, description: brandKit.description, siteName: brandKit.name, type: "website" },
  twitter: { card: "summary_large_image", title: brandKit.name, description: brandKit.description }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="terminal" className={`${fontBody.variable} ${fontDisplay.variable} ${fontMono.variable}`}>
      <body>
        <BetSlipProvider>
          <AppShell>{children}</AppShell>
          <BetSlipDrawer />
        </BetSlipProvider>
        <script dangerouslySetInnerHTML={{ __html: trendsCenterLabelScript }} />
      </body>
    </html>
  );
}

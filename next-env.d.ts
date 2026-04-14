@tailwind base;
@tailwind components;
@tailwind utilities;

@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap');

:root {
  color-scheme: dark;

  /* ── Brand palette ── */
  --brand-ink:          #04070d;
  --brand-abyss:        #07111c;
  --brand-panel:        #0d1828;
  --brand-panel-strong: #0a1320;
  --brand-line:         #1a2a40;
  --brand-blue:         #44a4ff;
  --brand-blue-2:       #188cff;
  --brand-gold:         #d1ac63;
  --brand-text:         #f2f7ff;
  --brand-muted:        #90a3c0;
  --brand-dim:          #3e5470;
  --brand-green:        #22d3a0;
  --brand-red:          #f05a5a;
  --brand-amber:        #f5a623;
  --brand-purple:       #a78bfa;

  /* ── Typography ── */
  --font-body:    'IBM Plex Sans',  'Segoe UI',  system-ui, sans-serif;
  --font-display: 'Space Grotesk',  'Aptos',     'Segoe UI', system-ui, sans-serif;
  --font-mono:    'IBM Plex Mono',  'SFMono-Regular', 'Consolas', monospace;
}

/* ── Root background ── */
html {
  min-height: 100%;
  background:
    radial-gradient(circle at 15% 0%,  rgba(68, 164, 255, 0.14), transparent 24%),
    radial-gradient(circle at 100% 10%, rgba(209, 172, 99,  0.08), transparent 22%),
    linear-gradient(180deg, #03070d 0%, #07111b 42%, #09131e 100%);
}

body {
  min-height: 100vh;
  margin: 0;
  color: var(--brand-text);
  font-family: var(--font-body), system-ui, sans-serif;
  overflow-x: hidden;
  background:
    linear-gradient(rgba(56, 86, 140, 0.07) 1px, transparent 1px),
    linear-gradient(90deg, rgba(56, 86, 140, 0.07) 1px, transparent 1px),
    radial-gradient(ellipse at 20% 0%,  rgba(68, 164, 255, 0.12), transparent 40%),
    radial-gradient(ellipse at 90% 5%,  rgba(209, 172, 99,  0.07), transparent 30%),
    linear-gradient(180deg, #03070d 0%, #07111b 50%, #09131e 100%);
  background-size: 44px 44px, 44px 44px, auto, auto, auto;
  background-position: center top, center top, center top, center top, center top;
}

* { box-sizing: border-box; }

a { color: inherit; text-decoration: none; }

button, input, select, textarea { font: inherit; }

::selection {
  background: rgba(68, 164, 255, 0.28);
  color: #f8fbff;
}

/* ── Scrollbar ── */
::-webkit-scrollbar       { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,.12); border-radius: 2px; }

/* ══════════════════════════════════════════
   LAYOUT SHELLS
══════════════════════════════════════════ */

.app-shell-grid {
  background:
    radial-gradient(circle at top,   rgba(68,164,255,.04), transparent 26%),
    radial-gradient(circle at bottom right, rgba(209,172,99,.04), transparent 20%);
}

.workspace-frame {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.07);
  background: rgba(7, 17, 28, 0.94);
  box-shadow: 0 28px 90px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(24px);
}

@media (min-width: 1280px) {
  .workspace-frame { border-radius: 1.75rem; }
}

.workspace-frame::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(180deg, rgba(255,255,255,.022), transparent 12%),
    radial-gradient(circle at top right, rgba(68,164,255,.07), transparent 22%);
}

.workspace-main {
  @apply relative min-w-0 flex-1;
}

.page-shell {
  @apply mx-auto grid w-full max-w-[1560px] gap-8 px-4 pb-20 pt-6 md:px-6 xl:px-8;
}

/* ══════════════════════════════════════════
   SURFACE / PANEL SYSTEM
══════════════════════════════════════════ */

.panel {
  @apply rounded-[1.35rem];
  border: 1px solid rgba(26, 42, 64, 0.85);
  background: rgba(13, 24, 40, 0.92);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(12px);
}

.surface-panel {
  @apply rounded-[1.35rem];
  border: 1px solid rgba(26, 42, 64, 0.85);
  background: rgba(11, 21, 36, 0.9);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(12px);
}

.surface-panel-strong {
  @apply rounded-[1.35rem];
  border: 1px solid rgba(30, 48, 72, 0.9);
  background: rgba(10, 19, 32, 0.96);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(16px);
}

/* panel header rule */
.panel-header-rule {
  border-top: 1px solid rgba(255,255,255,.05);
}

/* ══════════════════════════════════════════
   TYPOGRAPHY UTILITIES
══════════════════════════════════════════ */

.font-display { font-family: var(--font-display); }
.font-mono    { font-family: var(--font-mono); }

.eyebrow {
  font-size: 0.6rem;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: var(--brand-dim);
  font-weight: 600;
}

.eyebrow-blue {
  font-size: 0.6rem;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: var(--brand-blue-2);
  font-weight: 600;
}

/* ══════════════════════════════════════════
   BADGE SYSTEM
══════════════════════════════════════════ */

.badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.badge-green  { background: rgba(34,211,160,.12); color: var(--brand-green);  border: 1px solid rgba(34,211,160,.22); }
.badge-red    { background: rgba(240,90,90,.10);  color: var(--brand-red);    border: 1px solid rgba(240,90,90,.18); }
.badge-blue   { background: rgba(68,164,255,.10); color: var(--brand-blue);   border: 1px solid rgba(68,164,255,.2); }
.badge-amber  { background: rgba(245,166,35,.08); color: var(--brand-amber);  border: 1px solid rgba(245,166,35,.18); }
.badge-dim    { background: rgba(255,255,255,.05); color: var(--brand-muted); border: 1px solid rgba(255,255,255,.1); }
.badge-purple { background: rgba(167,139,250,.1); color: var(--brand-purple); border: 1px solid rgba(167,139,250,.2); }
.badge-live   { background: rgba(34,211,160,.1);  color: var(--brand-green);  border: 1px solid rgba(34,211,160,.2);
                animation: badge-pulse 1.8s ease-in-out infinite; }

@keyframes badge-pulse { 0%,100%{opacity:1} 50%{opacity:.5} }

/* ══════════════════════════════════════════
   NAVIGATION
══════════════════════════════════════════ */

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 10px;
  font-size: 0.84rem;
  font-weight: 500;
  color: var(--brand-muted);
  cursor: pointer;
  transition: all 0.15s;
  border: 1px solid transparent;
  margin-bottom: 1px;
  position: relative;
}

.nav-item:hover {
  color: #fff;
  background: rgba(255,255,255,.04);
}

.nav-item.active {
  color: #fff;
  background: rgba(68,164,255,.09);
  border-color: rgba(68,164,255,.16);
}

.nav-item.active::before {
  content: '';
  position: absolute;
  left: -1px;
  top: 25%;
  bottom: 25%;
  width: 2px;
  background: var(--brand-blue-2);
  border-radius: 2px;
}

.nav-section-label {
  font-size: 0.58rem;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: #2e4460;
  font-weight: 600;
  padding: 0 8px;
  margin-bottom: 6px;
}

/* ══════════════════════════════════════════
   STAT / METRIC CARDS
══════════════════════════════════════════ */

.stat-card {
  background: rgba(13,24,40,.92);
  border: 1px solid rgba(255,255,255,.07);
  border-radius: 16px;
  padding: 18px 20px;
  position: relative;
  overflow: hidden;
  transition: border-color .2s;
  cursor: pointer;
}

.stat-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(68,164,255,.3), transparent);
  opacity: 0;
  transition: opacity .3s;
}

.stat-card:hover { border-color: rgba(68,164,255,.2); }
.stat-card:hover::before { opacity: 1; }

.stat-label {
  font-size: 0.62rem;
  letter-spacing: 0.25em;
  text-transform: uppercase;
  color: var(--brand-dim);
  font-weight: 600;
}

.stat-value {
  font-size: 2.2rem;
  font-weight: 800;
  letter-spacing: -0.04em;
  color: #fff;
  margin-top: 6px;
  line-height: 1;
  font-family: var(--font-mono);
}

.stat-value.green  { color: var(--brand-green); }
.stat-value.amber  { color: var(--brand-amber); }
.stat-value.red    { color: var(--brand-red); }
.stat-value.blue   { color: var(--brand-blue); }

/* ══════════════════════════════════════════
   PROB BARS
══════════════════════════════════════════ */

.prob-bar-wrap {
  flex: 1;
  height: 8px;
  background: rgba(255,255,255,.06);
  border-radius: 4px;
  overflow: hidden;
}

.prob-bar {
  height: 100%;
  border-radius: 4px;
  transition: width 0.9s cubic-bezier(.16,1,.3,1);
}

.prob-bar.green { background: linear-gradient(90deg, rgba(34,211,160,.7), rgba(34,211,160,.35)); }
.prob-bar.blue  { background: linear-gradient(90deg, rgba(68,164,255,.7), rgba(68,164,255,.35)); }
.prob-bar.red   { background: linear-gradient(90deg, rgba(240,90,90,.7),  rgba(240,90,90,.35)); }
.prob-bar.amber { background: linear-gradient(90deg, rgba(245,166,35,.6), rgba(245,166,35,.3)); }

/* ══════════════════════════════════════════
   PILL / TAB CONTROLS
══════════════════════════════════════════ */

.pill-group {
  display: flex;
  gap: 3px;
  background: rgba(255,255,255,.03);
  border-radius: 10px;
  padding: 3px;
  border: 1px solid rgba(255,255,255,.06);
}

.pill {
  flex: 1;
  text-align: center;
  padding: 6px 8px;
  border-radius: 8px;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  color: var(--brand-muted);
  transition: all .15s;
}

.pill.active {
  background: rgba(68,164,255,.15);
  color: #fff;
  box-shadow: inset 0 0 0 1px rgba(68,164,255,.25);
}

.pill:hover:not(.active) { color: #fff; }

/* ══════════════════════════════════════════
   BOOK / CONSENSUS BARS
══════════════════════════════════════════ */

.book-bar-wrap {
  flex: 1;
  height: 6px;
  background: rgba(255,255,255,.07);
  border-radius: 3px;
  overflow: hidden;
}

.book-bar {
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, var(--brand-blue-2), rgba(68,164,255,.4));
  transition: width 0.8s cubic-bezier(.16,1,.3,1);
}

/* ══════════════════════════════════════════
   SIGNAL / INTELLIGENCE CARDS
══════════════════════════════════════════ */

.signal-card {
  padding: 14px 18px;
  border-bottom: 1px solid rgba(255,255,255,.04);
  cursor: pointer;
  transition: background .15s;
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.signal-card:hover { background: rgba(68,164,255,.04); }
.signal-card:last-child { border-bottom: none; }

.signal-icon {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.si-edge  { background: rgba(34,211,160,.12); border: 1px solid rgba(34,211,160,.2); }
.si-trap  { background: rgba(240,90,90,.1);   border: 1px solid rgba(240,90,90,.2); }
.si-watch { background: rgba(68,164,255,.1);  border: 1px solid rgba(68,164,255,.2); }

/* ══════════════════════════════════════════
   CALLOUT BOXES
══════════════════════════════════════════ */

.callout {
  padding: 12px 16px;
  border-radius: 12px;
  font-size: 0.78rem;
  line-height: 1.6;
}

.callout.edge  { background: rgba(34,211,160,.05); border: 1px solid rgba(34,211,160,.18); color: rgba(230,255,248,.85); }
.callout.trap  { background: rgba(240,90,90,.05);  border: 1px solid rgba(240,90,90,.15);  color: rgba(255,228,228,.85); }
.callout.info  { background: rgba(68,164,255,.05); border: 1px solid rgba(68,164,255,.15); color: rgba(220,235,255,.85); }
.callout.warn  { background: rgba(245,166,35,.05); border: 1px solid rgba(245,166,35,.15); color: rgba(255,240,210,.85); }

.callout-title {
  font-size: 0.6rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  font-weight: 700;
  margin-bottom: 4px;
}
.callout.edge .callout-title { color: var(--brand-green); }
.callout.trap .callout-title { color: var(--brand-red); }
.callout.info .callout-title { color: var(--brand-blue); }
.callout.warn .callout-title { color: var(--brand-amber); }

/* ══════════════════════════════════════════
   MOBILE UTILITIES (unchanged from original)
══════════════════════════════════════════ */

.mobile-surface {
  background: rgba(9, 19, 32, 0.94);
  border-bottom: 1px solid rgba(255,255,255,.06);
}

@media (min-width: 1280px) {
  .mobile-surface {
    background: rgba(11,21,36,.9);
    border: 1px solid rgba(26,42,64,.85);
    border-radius: 1.35rem;
    box-shadow: 0 16px 40px rgba(0,0,0,.28);
  }
}

.mobile-page-shell { @apply grid gap-5; }
.mobile-section-eyebrow {
  font-size: 0.6rem;
  letter-spacing: 0.26em;
  text-transform: uppercase;
  color: var(--brand-dim);
  font-weight: 600;
}

.mobile-scroll-row {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.hide-scrollbar::-webkit-scrollbar { display: none; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

.mobile-icon-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,.1);
  background: rgba(255,255,255,.04);
  color: var(--brand-muted);
  flex-shrink: 0;
  transition: all .15s;
}
.mobile-icon-button:hover { border-color: rgba(68,164,255,.25); color: #fff; }

/* ══════════════════════════════════════════
   TERMINAL / DATA UTILITIES
══════════════════════════════════════════ */

.terminal-rule {
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(68,164,255,.2), transparent);
}

.data-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

@media (min-width: 640px) {
  .data-grid { grid-template-columns: repeat(4, 1fr); }
}

/* ══════════════════════════════════════════
   BUTTONS
══════════════════════════════════════════ */

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 16px;
  border-radius: 20px;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  cursor: pointer;
  border: 1px solid rgba(255,255,255,.1);
  background: rgba(255,255,255,.04);
  color: var(--brand-muted);
  transition: all .15s;
  font-family: var(--font-body);
}
.btn:hover                 { border-color: rgba(68,164,255,.25); color: #fff; }
.btn.primary               { background: var(--brand-blue-2); border-color: var(--brand-blue-2); color: #03070d; }
.btn.primary:hover         { background: #3ba5ff; }
.btn.success               { border-color: rgba(34,211,160,.3); color: var(--brand-green); background: rgba(34,211,160,.07); }
.btn.danger                { border-color: rgba(240,90,90,.3);  color: var(--brand-red); }

/* ══════════════════════════════════════════
   LIVE STATUS DOT
══════════════════════════════════════════ */

.live-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--brand-green);
  box-shadow: 0 0 8px rgba(34,211,160,.6);
  animation: live-pulse 1.8s ease-in-out infinite;
}

@keyframes live-pulse { 0%,100%{opacity:1} 50%{opacity:.35} }

/* ══════════════════════════════════════════
   SHARK SCORE RING (inline SVG utility)
══════════════════════════════════════════ */

.shark-score {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.6rem;
  font-weight: 800;
  font-family: var(--font-mono);
  border: 1.5px solid;
  flex-shrink: 0;
}

.ss-high { background: rgba(34,211,160,.12); border-color: rgba(34,211,160,.35); color: var(--brand-green); }
.ss-mid  { background: rgba(245,166,35,.1);  border-color: rgba(245,166,35,.3);  color: var(--brand-amber); }
.ss-low  { background: rgba(255,255,255,.05); border-color: rgba(255,255,255,.12); color: var(--brand-muted); }

/* ══════════════════════════════════════════
   LADDER ROWS (alt-line)
══════════════════════════════════════════ */

.ladder-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  margin: 0 -8px;
  border-bottom: 1px solid rgba(255,255,255,.03);
  cursor: pointer;
  transition: background .12s;
  border-radius: 6px;
}
.ladder-row:hover { background: rgba(68,164,255,.05); }
.ladder-row:last-child { border-bottom: none; }

/* ══════════════════════════════════════════
   GAME ROW (board table)
══════════════════════════════════════════ */

.game-row {
  display: flex;
  align-items: center;
  padding: 13px 22px;
  border-bottom: 1px solid rgba(255,255,255,.04);
  cursor: pointer;
  transition: background .15s;
}
.game-row:last-child { border-bottom: none; }
.game-row:hover { background: rgba(68,164,255,.04); }

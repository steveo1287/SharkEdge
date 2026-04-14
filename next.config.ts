"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";

// ── MATH ─────────────────────────────────────────────────────────────────────

function erf(x: number): number {
  const sign = x >= 0 ? 1 : -1;
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * Math.abs(x));
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-x * x);
  return sign * y;
}

function normalCdf(x: number, mean: number, sd: number): number {
  if (sd <= 0) return x >= mean ? 1 : 0;
  return 0.5 * (1 + erf((x - mean) / (sd * Math.sqrt(2))));
}

function overProb(line: number, mean: number, sd: number): number {
  return Math.max(0.001, Math.min(0.999, 1 - normalCdf(line, mean, sd)));
}

function normalPdf(x: number, mean: number, sd: number): number {
  return Math.exp(-0.5 * ((x - mean) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI));
}

function pct(v: number, d = 1): string { return `${(v * 100).toFixed(d)}%`; }
function fmt(v: number, d = 2): string { return `${v > 0 ? "+" : ""}${v.toFixed(d)}`; }
function r(v: number, d = 2): number   { return Number(v.toFixed(d)); }

// ── TYPES ─────────────────────────────────────────────────────────────────────

type Market = "total" | "spread" | "ml-away" | "ml-home";
type LineSource = "consensus" | "book" | "custom";
type SimTab = "edges" | "drivers" | "bookmesh" | "props";

interface PropDef {
  key: string;
  label: string;
  playerName: string;
  stat: string;
  mean: number;
  line: number;
  sd: number;
  drivers: string[];
  side: "OVER" | "UNDER" | "NONE";
}

interface BookEntry {
  key: string;
  name: string;
  line: number;
  odds: string;
  execScore: number;
  outlier?: boolean;
  best?: boolean;
}

// ── CONSTANTS ─────────────────────────────────────────────────────────────────

const MARKET_CONFIG: Record<Market, { label: string; proj: number; sd: number; consensusLine: number; unit: string }> = {
  "total":    { label: "Game total (O/U)", proj: 8.40, sd: 2.2,  consensusLine: 8.5,   unit: "runs" },
  "spread":   { label: "Home spread",      proj: -1.02, sd: 1.8, consensusLine: -1.5,  unit: "runs" },
  "ml-away":  { label: "NYY moneyline",    proj: 0.56, sd: 0.22, consensusLine: -148,  unit: "win prob" },
  "ml-home":  { label: "HOU moneyline",    proj: 0.44, sd: 0.22, consensusLine:  125,  unit: "win prob" },
};

const BOOKS: Record<Market, BookEntry[]> = {
  "total": [
    { key: "pinnacle", name: "Pinnacle",    line: 8.5, odds: "-108 / -108", execScore: 9.2, best: true },
    { key: "fanduel",  name: "FanDuel",     line: 8.5, odds: "-110 / -110", execScore: 7.8 },
    { key: "dk",       name: "DraftKings",  line: 8.5, odds: "-110 / -110", execScore: 7.4 },
    { key: "betmgm",   name: "BetMGM",      line: 9.0, odds: "-115 / +100", execScore: 5.1, outlier: true },
  ],
  "spread": [
    { key: "pinnacle", name: "Pinnacle",    line: -1.5, odds: "-108 / -108", execScore: 9.2, best: true },
    { key: "fanduel",  name: "FanDuel",     line: -1.5, odds: "-110 / -110", execScore: 7.8 },
    { key: "dk",       name: "DraftKings",  line: -1.5, odds: "-110 / -110", execScore: 7.4 },
    { key: "betmgm",   name: "BetMGM",      line: -1.0, odds: "-118 / +100", execScore: 5.1, outlier: true },
  ],
  "ml-away": [
    { key: "pinnacle", name: "Pinnacle",    line: -142, odds: "-142 / +122", execScore: 9.2, best: true },
    { key: "fanduel",  name: "FanDuel",     line: -148, odds: "-148 / +126", execScore: 7.8 },
    { key: "dk",       name: "DraftKings",  line: -152, odds: "-152 / +128", execScore: 7.4 },
    { key: "betmgm",   name: "BetMGM",      line: -155, odds: "-155 / +130", execScore: 5.1 },
  ],
  "ml-home": [
    { key: "pinnacle", name: "Pinnacle",    line: 122, odds: "+122 / -142", execScore: 9.2, best: true },
    { key: "fanduel",  name: "FanDuel",     line: 126, odds: "+126 / -148", execScore: 7.8 },
    { key: "dk",       name: "DraftKings",  line: 128, odds: "+128 / -152", execScore: 7.4 },
    { key: "betmgm",   name: "BetMGM",      line: 130, odds: "+130 / -155", execScore: 5.1 },
  ],
};

const PROPS: PropDef[] = [
  {
    key: "judge-hr", label: "Aaron Judge · HR", playerName: "Aaron Judge", stat: "Home runs",
    mean: 0.72, line: 0.5, sd: 0.68,
    drivers: ["Rest advantage +2d", "Astros starter 1.28 HR/9", "Yankee Stadium HR park factor 1.14", "Lineup protection intact"],
    side: "OVER",
  },
  {
    key: "stanton-tb", label: "Stanton · Total bases", playerName: "Giancarlo Stanton", stat: "Total bases",
    mean: 1.94, line: 1.5, sd: 1.1,
    drivers: ["vs lefty pitcher — .312/.391 last 60d", "Lineup protection from Judge", "Park factor favors power"],
    side: "OVER",
  },
  {
    key: "cole-k", label: "Cole · Strikeouts", playerName: "Gerrit Cole", stat: "Pitcher K's",
    mean: 6.81, line: 7.5, sd: 2.1,
    drivers: ["Astros K% 19.4% (avg)", "Wind 12mph in from CF", "Pitch count limit likely"],
    side: "UNDER",
  },
  {
    key: "volpe-h", label: "Volpe · Hits", playerName: "Anthony Volpe", stat: "Hits",
    mean: 0.91, line: 0.5, sd: 0.82,
    drivers: ["8/18 AB hot streak", "Top of order slot", "Favorable vs Valdez historically"],
    side: "OVER",
  },
  {
    key: "alvarez-hr", label: "Alvarez · HR", playerName: "Yordan Alvarez", stat: "Home runs",
    mean: 0.51, line: 0.5, sd: 0.65,
    drivers: ["Coin flip — no actionable edge"],
    side: "NONE",
  },
];

// ── SPARKLINE ─────────────────────────────────────────────────────────────────

function Sparkline({ data, color, width = 64, height = 28 }: { data: number[]; color: string; width?: number; height?: number }) {
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height * 0.8) - height * 0.1;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: "visible" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── DISTRIBUTION CANVAS ───────────────────────────────────────────────────────

function DistributionChart({ mean, sd, marketLine }: { mean: number; sd: number; marketLine: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.offsetWidth || 600;
    const H = canvas.offsetHeight || 180;
    canvas.width = W * window.devicePixelRatio;
    canvas.height = H * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    ctx.clearRect(0, 0, W, H);

    const lo = mean - 4 * sd, hi = mean + 4 * sd;
    const toX = (v: number) => ((v - lo) / (hi - lo)) * (W - 40) + 20;
    const maxY = normalPdf(mean, mean, sd);
    const toY = (v: number) => H - 24 - (v / maxY) * (H - 48);

    // fill under curve
    ctx.beginPath();
    ctx.moveTo(toX(lo), toY(0));
    for (let x = lo; x <= hi; x += (hi - lo) / 300) {
      ctx.lineTo(toX(x), toY(normalPdf(x, mean, sd)));
    }
    ctx.lineTo(toX(hi), toY(0));
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0,   "rgba(68,164,255,0.25)");
    grad.addColorStop(0.7, "rgba(68,164,255,0.05)");
    grad.addColorStop(1,   "rgba(68,164,255,0)");
    ctx.fillStyle = grad;
    ctx.fill();

    // curve line
    ctx.beginPath();
    for (let x = lo; x <= hi; x += (hi - lo) / 300) {
      const px = toX(x), py = toY(normalPdf(x, mean, sd));
      x === lo ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.strokeStyle = "rgba(68,164,255,0.85)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // sim mean line
    const mx = toX(mean);
    ctx.beginPath();
    ctx.moveTo(mx, H - 24);
    ctx.lineTo(mx, toY(maxY));
    ctx.strokeStyle = "rgba(34,211,160,0.7)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.stroke();

    // market line
    const lx = toX(marketLine);
    ctx.beginPath();
    ctx.moveTo(lx, H - 24);
    ctx.lineTo(lx, toY(maxY * 0.9));
    ctx.strokeStyle = "rgba(245,166,35,0.7)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    // x-axis
    ctx.beginPath();
    ctx.moveTo(20, H - 24);
    ctx.lineTo(W - 20, H - 24);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // axis labels
    ctx.fillStyle = "rgba(144,163,192,0.6)";
    ctx.font = "10px IBM Plex Mono, monospace";
    ctx.textAlign = "center";
    for (let x = Math.ceil(lo); x <= Math.floor(hi); x += Math.ceil(sd)) {
      ctx.fillText(x.toFixed(1), toX(x), H - 8);
    }
  }, [mean, sd, marketLine]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%", display: "block" }}
      role="img"
      aria-label={`Monte Carlo distribution for game total. Sim mean ${mean.toFixed(2)}, market line ${marketLine.toFixed(1)}`}
    />
  );
}

// ── PROB BAR ROW ──────────────────────────────────────────────────────────────

function ProbRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-14 text-[0.7rem] font-semibold text-slate-400 flex-shrink-0">{label}</div>
      <div className="flex-1 h-2 bg-white/[0.06] rounded-full overflow-hidden">
        <div className="prob-bar" style={{ width: `${(value * 100).toFixed(1)}%`, background: color, transition: "width 0.8s cubic-bezier(.16,1,.3,1)" }} />
      </div>
      <div className="w-12 text-right text-[0.72rem] font-mono font-bold flex-shrink-0" style={{ color }}>{pct(value)}</div>
    </div>
  );
}

// ── ALT LADDER ────────────────────────────────────────────────────────────────

function AltLadder({ activeLine, mean, sd, step }: { activeLine: number; mean: number; sd: number; step: number }) {
  const lines = useMemo(() => {
    const arr: number[] = [];
    for (let i = -3; i <= 3; i++) arr.push(r(activeLine + i * step, 1));
    return arr;
  }, [activeLine, step]);

  return (
    <div className="flex flex-col gap-0.5">
      {lines.map((line) => {
        const op = overProb(line, mean, sd);
        const ev = r(mean - line, 2);
        const isActive = Math.abs(line - activeLine) < 0.01;
        const barW = Math.round(op * 100);
        const barColor = op > 0.55 ? "rgba(34,211,160,.55)" : op < 0.45 ? "rgba(68,164,255,.55)" : "rgba(144,163,192,.35)";
        const evColor = ev > 0.1 ? "#22d3a0" : ev < -0.1 ? "#f05a5a" : "#3e5470";
        return (
          <div
            key={line}
            className={cn(
              "flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors",
              isActive ? "bg-sky-500/10 border border-sky-400/20" : "hover:bg-white/[0.03]"
            )}
          >
            <div className={cn("w-10 text-[0.78rem] font-mono font-bold flex-shrink-0", isActive ? "text-sky-300" : "text-white")}>
              O{line.toFixed(1)}
            </div>
            <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
              <div style={{ width: `${barW}%`, height: "100%", borderRadius: 9999, background: barColor, transition: "width .6s cubic-bezier(.16,1,.3,1)" }} />
            </div>
            <div className="w-10 text-right text-[0.68rem] font-mono text-slate-400 flex-shrink-0">{pct(op)}</div>
            <div className="w-10 text-right text-[0.68rem] font-mono font-bold flex-shrink-0" style={{ color: evColor }}>{fmt(ev)}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── MAIN COMPONENT ─────────────────────────────────────────────────────────────

export function SimWorkbenchClient() {
  const [market,     setMarket]     = useState<Market>("total");
  const [source,     setSource]     = useState<LineSource>("consensus");
  const [bookKey,    setBookKey]    = useState("pinnacle");
  const [customLine, setCustomLine] = useState("8.5");
  const [activeTab,  setActiveTab]  = useState<SimTab>("edges");
  const [activeProp, setActiveProp] = useState<PropDef>(PROPS[0]);
  const [simProj,    setSimProj]    = useState(8.40);
  const [running,    setRunning]    = useState(false);
  const [loggedBet,  setLoggedBet]  = useState(false);

  const cfg = MARKET_CONFIG[market];
  const books = BOOKS[market];

  const activeLine = useMemo(() => {
    if (source === "custom") {
      const n = parseFloat(customLine);
      return isNaN(n) ? cfg.consensusLine : n;
    }
    if (source === "book") {
      return books.find(b => b.key === bookKey)?.line ?? cfg.consensusLine;
    }
    return cfg.consensusLine;
  }, [source, customLine, bookKey, books, cfg.consensusLine]);

  const { proj, sd } = useMemo(() => ({ proj: simProj, sd: cfg.sd }), [simProj, cfg.sd]);

  const over  = overProb(activeLine, proj, sd);
  const under = 1 - over;
  const edge  = r(proj - activeLine, 2);
  const edgeLean = Math.abs(edge) < 0.05 ? "Neutral" : edge < 0 ? "UNDER lean" : "OVER lean";

  const propOver  = overProb(activeProp.line, activeProp.mean, activeProp.sd);
  const propEdge  = r(activeProp.mean - activeProp.line, 2);

  const runSim = useCallback(() => {
    if (running) return;
    setRunning(true);
    setTimeout(() => {
      setSimProj(prev => r(prev + (Math.random() * 0.5 - 0.25), 2));
      setRunning(false);
    }, 700);
  }, [running]);

  const logBet = useCallback(() => {
    setLoggedBet(true);
    setTimeout(() => setLoggedBet(false), 2500);
  }, []);

  // sync custom line when market changes
  useEffect(() => {
    setSimProj(cfg.proj);
    setCustomLine(String(cfg.consensusLine));
    setBookKey("pinnacle");
  }, [market, cfg.proj, cfg.consensusLine]);

  const ladder = useMemo(() => ({
    step: market === "spread" ? 0.5 : market.startsWith("ml") ? 5 : 1.0,
  }), [market]);

  return (
    <div className="grid gap-5 xl:grid-cols-[300px_1fr]">

      {/* ── LEFT RAIL ── */}
      <div className="flex flex-col gap-4">

        {/* Matchup header */}
        <div className="surface-panel overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-0 px-5 py-4">
            <div>
              <div className="text-2xl font-black tracking-tight text-white">NYY</div>
              <div className="text-[0.65rem] text-slate-500 mt-0.5">New York Yankees</div>
              <div className="text-[0.68rem] font-mono text-slate-400 mt-1">Sim: <span className="text-white">{(simProj * 0.56).toFixed(2)}</span> R</div>
            </div>
            <div className="text-center px-3">
              <div className="text-[0.58rem] uppercase tracking-[.28em] text-slate-600">vs</div>
              <div className="text-[0.78rem] font-mono font-bold text-white mt-0.5">7:05 PM</div>
              <div className="flex justify-center mt-1">
                <span className="live-dot" />
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-black tracking-tight text-white">HOU</div>
              <div className="text-[0.65rem] text-slate-500 mt-0.5">Houston Astros</div>
              <div className="text-[0.68rem] font-mono text-slate-400 mt-1">Sim: <span className="text-white">{(simProj * 0.44).toFixed(2)}</span> R</div>
            </div>
          </div>
        </div>

        {/* Market controls */}
        <div className="surface-panel overflow-hidden">
          <div className="px-4 pt-3 pb-2 border-b border-white/[0.05]">
            <div className="eyebrow mb-2">Game market</div>
            <select
              className="w-full bg-white/[0.04] border border-white/[0.09] rounded-xl text-white text-sm px-3 py-2.5 outline-none appearance-none cursor-pointer"
              value={market}
              onChange={e => setMarket(e.target.value as Market)}
            >
              {(Object.entries(MARKET_CONFIG) as [Market, typeof cfg][]).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>

          <div className="px-4 pt-3 pb-2 border-b border-white/[0.05]">
            <div className="eyebrow mb-2">Line source</div>
            <div className="pill-group">
              {(["consensus", "book", "custom"] as LineSource[]).map(s => (
                <div key={s} className={cn("pill", source === s && "active")} onClick={() => setSource(s)}>
                  {s}
                </div>
              ))}
            </div>
          </div>

          {source === "book" && (
            <div className="px-4 pt-3 pb-2 border-b border-white/[0.05]">
              <div className="eyebrow mb-2">Select book</div>
              <select
                className="w-full bg-white/[0.04] border border-white/[0.09] rounded-xl text-white text-sm px-3 py-2.5 outline-none appearance-none cursor-pointer"
                value={bookKey}
                onChange={e => setBookKey(e.target.value)}
              >
                {books.map(b => (
                  <option key={b.key} value={b.key}>{b.name} · {b.line} · {b.odds}</option>
                ))}
              </select>
            </div>
          )}

          {source === "custom" && (
            <div className="px-4 pt-3 pb-2 border-b border-white/[0.05]">
              <div className="eyebrow mb-2">Custom line</div>
              <input
                className="w-full bg-white/[0.04] border border-white/[0.09] rounded-xl text-white font-mono text-sm px-3 py-2.5 outline-none focus:border-sky-400/40"
                value={customLine}
                onChange={e => setCustomLine(e.target.value)}
              />
            </div>
          )}

          {/* Key numbers */}
          <div className="grid grid-cols-3 gap-2 px-4 py-3">
            {[
              { label: "Projected", value: proj.toFixed(2), color: "text-sky-400" },
              { label: "Active line", value: activeLine.toFixed(market.startsWith("ml") ? 0 : 1), color: "text-white" },
              { label: "Edge", value: fmt(edge), color: edge < -0.05 ? "text-sky-400" : edge > 0.05 ? "text-emerald-400" : "text-slate-500" },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white/[0.03] border border-white/[0.05] rounded-xl p-2.5">
                <div className="eyebrow mb-1">{label}</div>
                <div className={cn("text-xl font-black font-mono tracking-tight", color)}>{value}</div>
                {label === "Edge" && <div className="text-[0.58rem] text-slate-600 mt-0.5">{edgeLean}</div>}
              </div>
            ))}
          </div>
        </div>

        {/* Probabilities */}
        <div className="surface-panel px-4 py-3 flex flex-col gap-2.5">
          <div className="eyebrow">Cover probabilities</div>
          <ProbRow label="Over"     value={over}  color="rgba(240,90,90,.8)" />
          <ProbRow label="Under"    value={under} color="rgba(68,164,255,.8)" />
          <div className="h-px bg-white/[0.05] my-1" />
          <ProbRow label="NYY win"  value={0.56}  color="rgba(34,211,160,.75)" />
          <ProbRow label="HOU win"  value={0.44}  color="rgba(245,166,35,.7)" />
        </div>

        {/* Alt line ladder */}
        <div className="surface-panel overflow-hidden">
          <div className="px-4 pt-3 pb-1 border-b border-white/[0.05]">
            <div className="eyebrow">Alt line ladder</div>
            <div className="flex justify-between text-[0.58rem] font-mono text-slate-600 mt-1">
              <span>LINE</span><span>PROB</span><span>EV</span>
            </div>
          </div>
          <div className="px-4 py-2">
            <AltLadder activeLine={activeLine} mean={proj} sd={sd} step={ladder.step} />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            className={cn("btn flex-1", running && "opacity-60 cursor-wait")}
            onClick={runSim}
            disabled={running}
          >
            {running ? "Running…" : "↺ Rerun sim"}
          </button>
          <button
            className={cn("btn flex-1", loggedBet ? "success" : "")}
            onClick={logBet}
          >
            {loggedBet ? "✓ Logged" : "Log best edge"}
          </button>
        </div>

      </div>

      {/* ── MAIN CONTENT ── */}
      <div className="flex flex-col gap-5">

        {/* Distribution chart */}
        <div className="surface-panel overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-white/[0.05]">
            <div>
              <div className="eyebrow">Probability distribution</div>
              <div className="text-[0.95rem] font-bold text-white mt-0.5">Monte Carlo · 10,000 simulations</div>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <span className="badge badge-green">sim {proj.toFixed(2)}</span>
              <span className="badge badge-amber">mkt {activeLine.toFixed(1)}</span>
            </div>
          </div>
          <div style={{ height: 200, padding: "16px 20px 8px" }}>
            <DistributionChart mean={proj} sd={sd} marketLine={activeLine} />
          </div>
          <div className="flex justify-center gap-5 pb-3 text-[0.68rem] text-slate-500">
            <span className="flex items-center gap-1.5"><span style={{ width: 10, height: 2, background: "rgba(68,164,255,.8)", display: "inline-block", borderRadius: 1 }} />Distribution</span>
            <span className="flex items-center gap-1.5"><span style={{ width: 10, height: 2, background: "rgba(34,211,160,.8)", display: "inline-block", borderRadius: 1 }} />Sim mean</span>
            <span className="flex items-center gap-1.5"><span style={{ width: 10, height: 2, background: "rgba(245,166,35,.8)", display: "inline-block", borderRadius: 1, borderTop: "1px dashed rgba(245,166,35,.8)" }} />Market line</span>
          </div>
        </div>

        {/* Tabbed bottom panel */}
        <div className="surface-panel overflow-hidden">

          {/* Tab bar */}
          <div className="flex border-b border-white/[0.05] overflow-x-auto">
            {([
              { key: "edges", label: "Top player edges" },
              { key: "drivers", label: "Sim drivers" },
              { key: "bookmesh", label: "Book mesh" },
              { key: "props", label: "Prop workbench" },
            ] as { key: SimTab; label: string }[]).map(({ key, label }) => (
              <button
                key={key}
                className={cn(
                  "px-5 py-3 text-[0.7rem] font-semibold uppercase tracking-[.12em] border-b-2 transition-all whitespace-nowrap",
                  activeTab === key
                    ? "text-white border-sky-400"
                    : "text-slate-500 border-transparent hover:text-slate-300"
                )}
                onClick={() => setActiveTab(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Edges tab */}
          {activeTab === "edges" && (
            <div>
              {PROPS.map(prop => {
                const op = overProb(prop.line, prop.mean, prop.sd);
                const ev = r(prop.mean - prop.line, 2);
                const sideColor = prop.side === "OVER" ? "#22d3a0" : prop.side === "UNDER" ? "#44a4ff" : "#3e5470";
                const evBadge = Math.abs(ev) >= 0.2 ? (ev > 0 ? "badge-green" : "badge-blue") : "badge-dim";
                return (
                  <div
                    key={prop.key}
                    className="flex items-start gap-3 px-5 py-3.5 border-b border-white/[0.04] last:border-b-0 cursor-pointer transition-colors hover:bg-sky-400/[0.03]"
                    onClick={() => { setActiveProp(prop); setActiveTab("props"); }}
                  >
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center font-black text-[0.6rem] tracking-wide flex-shrink-0 border"
                      style={{ background: `${sideColor}15`, borderColor: `${sideColor}30`, color: sideColor }}
                    >
                      {prop.side}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[0.87rem] font-bold text-white">{prop.playerName}</div>
                      <div className="text-[0.72rem] text-slate-400 mt-0.5">{prop.stat} · line {prop.line} · sim {prop.mean.toFixed(2)}</div>
                      <div className="text-[0.7rem] text-slate-500 mt-1 leading-relaxed line-clamp-1">{prop.drivers[0]}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className={cn("badge", evBadge)}>{fmt(ev, 2)} ev</span>
                      <div className="text-[0.68rem] font-mono text-slate-500">{prop.side === "OVER" ? pct(op) : pct(1 - op)} {prop.side.toLowerCase()}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Drivers tab */}
          {activeTab === "drivers" && (
            <div className="grid grid-cols-1 gap-3 p-5 md:grid-cols-3">
              {[
                {
                  title: "Game drivers",
                  items: [
                    { text: "NYY offense 108.4 vs HOU defense 96.2", signal: true },
                    { text: "Gerrit Cole: 2.84 ERA, K/9 = 11.2 last 8", signal: true },
                    { text: "Framber Valdez: 3.62 ERA, sinker-heavy", signal: false },
                    { text: "Yankee Stadium HR park factor: 1.14", signal: false },
                  ],
                },
                {
                  title: "Style & context",
                  items: [
                    { text: "NYY pace 38.2 PA/G, HOU 36.9 — under pace", signal: true },
                    { text: "Both bullpens fresh: 1.8 IP avg last 3d", signal: false },
                    { text: "No B2B flags — full rest both teams", signal: false },
                    { text: "Lineup certainty HIGH — starters confirmed", signal: true },
                  ],
                },
                {
                  title: "Intangibles & weather",
                  items: [
                    { text: "Wind 12 mph in from CF — suppresses fly balls ~4%", signal: true },
                    { text: "Temp 58°F — reduces ball carry slightly", signal: false },
                    { text: "No injury reports on key lineup slots", signal: false },
                    { text: "Revenge spot: NYY swept by HOU last series", signal: true },
                  ],
                },
              ].map(({ title, items }) => (
                <div key={title} className="bg-white/[0.025] border border-white/[0.05] rounded-2xl p-4">
                  <div className="eyebrow mb-3">{title}</div>
                  <div className="flex flex-col gap-2">
                    {items.map(({ text, signal }) => (
                      <div key={text} className={cn("text-[0.74rem] px-2.5 py-1.5 rounded-lg leading-relaxed", signal ? "text-slate-200 bg-white/[0.04]" : "text-slate-500 bg-transparent")}>
                        {text}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <div className="md:col-span-3 callout trap">
                <div className="callout-title">Trap flag</div>
                Public 62% on Astros ML despite Pinnacle moving NYY direction. Classic square vs sharp dislocation — fade public, trail Pinnacle.
              </div>
            </div>
          )}

          {/* Book mesh tab */}
          {activeTab === "bookmesh" && (
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="text-[0.75rem] text-slate-400">4 books · {market === "total" ? "1 outlier (BetMGM)" : "0 outliers"} · mesh fresh</div>
                <span className="badge badge-green">Live</span>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {books.map(b => (
                  <div key={b.key} className={cn("border rounded-2xl p-3.5 cursor-pointer transition-colors hover:border-sky-400/30", b.best ? "bg-emerald-500/[0.04] border-emerald-400/25" : b.outlier ? "border-amber-400/20" : "bg-white/[0.03] border-white/[0.06]")}>
                    <div className="text-[0.72rem] font-semibold text-slate-400 truncate">{b.name}</div>
                    <div className={cn("text-xl font-black font-mono mt-1.5", b.outlier ? "text-amber-300" : "text-white")}>{b.line}</div>
                    <div className="text-[0.68rem] font-mono text-slate-500 mt-0.5">{b.odds}</div>
                    <div className={cn("text-[0.62rem] font-mono font-bold mt-2", b.execScore >= 8 ? "text-emerald-400" : b.execScore >= 6 ? "text-sky-400" : "text-slate-500")}>
                      Exec {b.execScore.toFixed(1)}
                    </div>
                    {b.best    && <div className="text-[0.58rem] text-emerald-400 mt-1 uppercase tracking-wide font-bold">✓ Best book</div>}
                    {b.outlier && <div className="text-[0.58rem] text-amber-400 mt-1 uppercase tracking-wide font-bold">⚠ Outlier</div>}
                  </div>
                ))}
              </div>
              <div className="callout info mt-4">
                <div className="callout-title">Best book callout</div>
                Pinnacle U{cfg.consensusLine} is the sharpest number. Execution score 9.2/10.
                {market === "total" && " BetMGM hanging O9 is an outlier — shop that line only when taking the Over."}
              </div>
            </div>
          )}

          {/* Props workbench tab */}
          {activeTab === "props" && (
            <div>
              <div className="px-5 pt-4 pb-3 border-b border-white/[0.04]">
                <div className="eyebrow mb-2">Select player prop</div>
                <select
                  className="w-full bg-white/[0.04] border border-white/[0.09] rounded-xl text-white text-sm px-3 py-2.5 outline-none appearance-none cursor-pointer"
                  value={activeProp.key}
                  onChange={e => setActiveProp(PROPS.find(p => p.key === e.target.value) ?? PROPS[0])}
                >
                  {PROPS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-2 px-5 py-3 border-b border-white/[0.04]">
                {[
                  { label: "Sim mean", value: activeProp.mean.toFixed(2), color: "text-sky-400" },
                  { label: "Market line", value: activeProp.line.toFixed(1), color: "text-white" },
                  { label: "Edge", value: fmt(propEdge), color: propEdge > 0.05 ? "text-emerald-400" : propEdge < -0.05 ? "text-sky-400" : "text-slate-500" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-white/[0.03] border border-white/[0.05] rounded-xl p-2.5">
                    <div className="eyebrow mb-1">{label}</div>
                    <div className={cn("text-xl font-black font-mono tracking-tight", color)}>{value}</div>
                  </div>
                ))}
              </div>

              <div className="px-5 py-3 flex flex-col gap-2 border-b border-white/[0.04]">
                <ProbRow label="Over"  value={propOver}       color="rgba(34,211,160,.8)" />
                <ProbRow label="Under" value={1 - propOver}   color="rgba(68,164,255,.8)" />
              </div>

              <div className="px-5 py-3 border-b border-white/[0.04]">
                <div className="eyebrow mb-2">Alt line ladder</div>
                <AltLadder activeLine={activeProp.line} mean={activeProp.mean} sd={activeProp.sd} step={activeProp.stat === "Pitcher K's" ? 0.5 : 0.5} />
              </div>

              <div className="px-5 py-3 border-b border-white/[0.04]">
                <div className="eyebrow mb-2">Drivers</div>
                <div className="flex flex-col gap-1.5">
                  {activeProp.drivers.map(d => (
                    <div key={d} className="text-[0.74rem] text-slate-300 bg-white/[0.03] px-3 py-1.5 rounded-lg">{d}</div>
                  ))}
                </div>
              </div>

              <div className="px-5 py-3">
                <div className={cn("callout", activeProp.side === "OVER" ? "edge" : activeProp.side === "UNDER" ? "info" : "")}>
                  <div className="callout-title">{activeProp.playerName} · {activeProp.stat}</div>
                  Sim mean {activeProp.mean.toFixed(2)} vs line {activeProp.line.toFixed(1)} —&nbsp;
                  {Math.abs(propEdge) < 0.05 ? "no actionable edge." : `${activeProp.side === "OVER" ? "OVER" : "UNDER"} lean at ${fmt(Math.abs(propEdge * 100 / activeProp.line))}% EV.`}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

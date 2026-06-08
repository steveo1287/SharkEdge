import type { MlbGamePlateAppearanceScript, MlbHitterPlateAppearancePath, MlbPlateAppearanceNode } from "@/services/simulation/mlb-plate-appearance-game-script";

type Tone = "neutral" | "good" | "warn" | "bad";

function pct(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function phaseLabel(value: string) {
  return value.toLowerCase().replace(/_/g, " ");
}

function toneForOutcome(value: string): Tone {
  if (value === "POWER" || value === "CONTACT_PLUS") return "good";
  if (value === "VOLATILE" || value === "WALK") return "warn";
  if (value === "STRIKEOUT_RISK") return "bad";
  return "neutral";
}

function Pill({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  const cls = tone === "good"
    ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
    : tone === "warn"
      ? "border-amber-400/25 bg-amber-400/10 text-amber-200"
      : tone === "bad"
        ? "border-rose-400/25 bg-rose-400/10 text-rose-200"
        : "border-white/10 bg-white/[0.045] text-slate-300";
  return <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${cls}`}>{label}</span>;
}

function Mini({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-1 font-display text-xl font-black tracking-tight text-white">{value}</div>
      {sub ? <div className="mt-1 text-[11px] text-slate-500">{sub}</div> : null}
    </div>
  );
}

function WindowMini({ title, node }: { title: string; node: MlbPlateAppearanceNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">{title}</div>
      <div className="mt-1 font-semibold text-white">PA{node.paNumber} · inning {node.inning}</div>
      <div className="mt-1 text-xs text-slate-400">{phaseLabel(node.pitchingPhase)} · {phaseLabel(node.bestOutcome)}</div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-300">
        <div>H <span className="font-mono text-white">{pct(node.hitProbability)}</span></div>
        <div>HR <span className="font-mono text-white">{pct(node.homeRunProbability)}</span></div>
        <div>K <span className="font-mono text-white">{pct(node.strikeoutProbability)}</span></div>
      </div>
    </div>
  );
}

function SummaryPathCard({ path }: { path: MlbHitterPlateAppearancePath }) {
  return (
    <div className="rounded-2xl border border-aqua/15 bg-[#06101b]/90 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[9px] font-black uppercase tracking-[0.16em] text-aqua">#{path.battingOrder} · {path.team}</div>
          <div className="mt-1 font-display text-lg font-black text-white">{path.playerName}</div>
        </div>
        <Pill label={`PA${path.bestPowerWindow.paNumber} power`} tone={toneForOutcome(path.bestPowerWindow.bestOutcome)} />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-300">
        <div>Best H <span className="font-mono text-white">PA{path.bestHitWindow.paNumber}</span></div>
        <div>Best HR <span className="font-mono text-white">PA{path.bestPowerWindow.paNumber}</span></div>
        <div>Late PA <span className="font-mono text-white">{pct(path.latePaChance)}</span></div>
      </div>
      <div className="mt-2 text-xs leading-5 text-slate-500">
        {phaseLabel(path.bestPowerWindow.pitchingPhase)} · H {pct(path.bestPowerWindow.hitProbability)} · HR {pct(path.bestPowerWindow.homeRunProbability)} · K {pct(path.bestPowerWindow.strikeoutProbability)}
      </div>
    </div>
  );
}

function PathCard({ path }: { path: MlbHitterPlateAppearancePath }) {
  const lateTone: Tone = path.latePaChance >= 0.42 ? "good" : path.latePaChance >= 0.28 ? "warn" : "neutral";
  const bullpenTone: Tone = path.bullpenExposureShare >= 0.4 ? "warn" : "neutral";
  return (
    <article className="rounded-[1.35rem] border border-white/10 bg-[#06101b]/84 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-aqua">#{path.battingOrder} · {path.team}</div>
          <h3 className="mt-1 font-display text-xl font-black tracking-tight text-white">{path.playerName}</h3>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Pill label={`${Math.round(path.latePaChance * 100)}% late PA`} tone={lateTone} />
          <Pill label={`${Math.round(path.bullpenExposureShare * 100)}% bullpen`} tone={bullpenTone} />
        </div>
      </div>
      <div className="mt-3 text-xs leading-6 text-slate-400">{path.summary}</div>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <WindowMini title="Best hit" node={path.bestHitWindow} />
        <WindowMini title="Best power" node={path.bestPowerWindow} />
        <WindowMini title="K risk peak" node={path.highestStrikeoutRiskWindow} />
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-[760px] w-full text-left text-xs">
          <thead className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
            <tr className="border-b border-white/10">
              <th className="py-2 pr-3">PA</th><th className="py-2 pr-3">Inning</th><th className="py-2 pr-3">Phase</th><th className="py-2 pr-3">Outcome</th><th className="py-2 pr-3 text-right">H%</th><th className="py-2 pr-3 text-right">XBH%</th><th className="py-2 pr-3 text-right">HR%</th><th className="py-2 pr-3 text-right">BB%</th><th className="py-2 text-right">K%</th>
            </tr>
          </thead>
          <tbody>
            {path.plateAppearances.map((pa) => (
              <tr key={`${path.playerId}-${pa.paNumber}`} className="border-b border-white/[0.06] text-slate-300">
                <td className="py-2 pr-3 font-mono">{pa.paNumber}</td>
                <td className="py-2 pr-3 font-mono">{pa.inning}</td>
                <td className="py-2 pr-3 text-slate-400">{phaseLabel(pa.pitchingPhase)}</td>
                <td className="py-2 pr-3"><Pill label={phaseLabel(pa.bestOutcome)} tone={toneForOutcome(pa.bestOutcome)} /></td>
                <td className="py-2 pr-3 text-right font-mono text-aqua">{pct(pa.hitProbability)}</td>
                <td className="py-2 pr-3 text-right font-mono">{pct(pa.extraBaseHitProbability)}</td>
                <td className="py-2 pr-3 text-right font-mono">{pct(pa.homeRunProbability)}</td>
                <td className="py-2 pr-3 text-right font-mono">{pct(pa.walkProbability)}</td>
                <td className="py-2 text-right font-mono">{pct(pa.strikeoutProbability)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

export function PlateAppearanceSummaryStrip({ script }: { script: MlbGamePlateAppearanceScript }) {
  const topPaths = script.topPlateAppearancePaths.slice(0, 4);
  return (
    <section className="rounded-[1.45rem] border border-aqua/30 bg-[radial-gradient(circle_at_top_left,rgba(0,210,255,0.16),transparent_18rem),rgba(6,16,27,0.82)] p-4 shadow-[0_18px_70px_rgba(0,0,0,0.24)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-aqua">Box score summary · PA script</div>
          <h2 className="font-display text-3xl font-black tracking-tight text-white">Plate Appearance Windows</h2>
          <div className="mt-1 text-sm leading-6 text-slate-400">Top hit/power windows are surfaced here so the PA model is visible before the detailed tables.</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Pill label={`${script.awayTeam.team} BP inn ${script.awayTeam.bullpenExposureBeginsInning}`} tone="warn" />
          <Pill label={`${script.homeTeam.team} BP inn ${script.homeTeam.bullpenExposureBeginsInning}`} tone="warn" />
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Mini label={`${script.awayTeam.team} late PA`} value={pct(script.awayTeam.averageLatePaChance)} sub={`${Math.round(script.awayTeam.bullpenExposureShare * 100)}% bullpen exposure`} />
        <Mini label={`${script.homeTeam.team} late PA`} value={pct(script.homeTeam.averageLatePaChance)} sub={`${Math.round(script.homeTeam.bullpenExposureShare * 100)}% bullpen exposure`} />
        <Mini label="Top PA paths" value={String(script.topPlateAppearancePaths.length)} sub="ranked by hit/power/late PA" />
        <Mini label="Model layer" value="PA v1" sub="inning + pitcher phase" />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-4">
        {topPaths.map((path) => <SummaryPathCard key={`summary-${path.playerId}`} path={path} />)}
      </div>
    </section>
  );
}

export function PlateAppearanceSnapshot({ script }: { script: MlbGamePlateAppearanceScript }) {
  return (
    <section className="rounded-[1.35rem] border border-white/10 bg-white/[0.035] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-aqua">Plate appearance path detail</div>
          <h2 className="font-display text-2xl font-black tracking-tight text-white">Full PA Breakdown</h2>
        </div>
        <Pill label={script.modelVersion.replace("mlb-", "")} />
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Mini label={`${script.awayTeam.team} bullpen starts`} value={`Inn ${script.awayTeam.bullpenExposureBeginsInning}`} sub={`${Math.round(script.awayTeam.bullpenExposureShare * 100)}% PA exposure`} />
        <Mini label={`${script.homeTeam.team} bullpen starts`} value={`Inn ${script.homeTeam.bullpenExposureBeginsInning}`} sub={`${Math.round(script.homeTeam.bullpenExposureShare * 100)}% PA exposure`} />
        <Mini label={`${script.awayTeam.team} late PA`} value={pct(script.awayTeam.averageLatePaChance)} sub="average chance" />
        <Mini label={`${script.homeTeam.team} late PA`} value={pct(script.homeTeam.averageLatePaChance)} sub="average chance" />
      </div>
      <div className="mt-3 text-sm leading-7 text-slate-300">{script.summary}</div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {script.topPlateAppearancePaths.slice(0, 4).map((path) => <PathCard key={path.playerId} path={path} />)}
      </div>
    </section>
  );
}

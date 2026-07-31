import { prisma } from "@/lib/db/prisma";
import { SimSignalCard } from "@/components/sim/sim-ui";
import type { MlbFranchiseGameCenter } from "@/services/simulation/mlb-franchise-game-stats";

type Hitter = MlbFranchiseGameCenter["hitters"]["away"][number];
type Pitcher = MlbFranchiseGameCenter["pitchers"]["away"][number];

type RatingRow = {
  id: string | null;
  name: string | null;
  team: string | null;
  overall: number | null;
  contact: number | null;
  power: number | null;
  discipline: number | null;
  vs_lhp: number | null;
  vs_rhp: number | null;
  baserunning: number | null;
  fielding: number | null;
  current_form: number | null;
  xera_quality: number | null;
  fip_quality: number | null;
  k_bb: number | null;
  hr_risk: number | null;
  groundball_rate: number | null;
  platoon_split: number | null;
  stamina: number | null;
  recent_workload: number | null;
  arsenal_quality: number | null;
  metrics_json: Record<string, unknown> | null;
  source: string | null;
  snapshot_at: Date | string | null;
};

type Skill = { label: string; value: number | null; note?: string };

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function score(value: unknown) {
  const n = numberValue(value);
  return n == null ? null : Math.max(0, Math.min(100, Number(n.toFixed(1))));
}

function inverse(value: unknown) {
  const n = score(value);
  return n == null ? null : Number((100 - n).toFixed(1));
}

function normalize(value: unknown) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function grade(value: number | null) {
  if (value == null) return "DATA GAP";
  if (value >= 90) return "ELITE";
  if (value >= 82) return "PLUS";
  if (value >= 72) return "ABOVE AVG";
  if (value >= 62) return "PLAYABLE";
  if (value >= 52) return "THIN";
  return "RISK";
}

function metric(row: RatingRow, key: string) {
  return row.metrics_json && typeof row.metrics_json[key] === "object" && row.metrics_json[key] !== null
    ? row.metrics_json[key] as Record<string, unknown>
    : row.metrics_json?.[key];
}

function rawMetric(row: RatingRow, key: string) {
  const value = row.metrics_json?.[key];
  return numberValue(value);
}

function pctScore(value: unknown) {
  const n = numberValue(value);
  if (n == null) return null;
  const pct = n <= 1 ? n * 100 : n;
  return Math.max(0, Math.min(100, Number(pct.toFixed(1))));
}

function latestRating(rows: RatingRow[], id: string | null | undefined, name: string) {
  const idKey = normalize(id);
  const nameKey = normalize(name);
  return rows.find((row) => (idKey && normalize(row.id) === idKey) || normalize(row.name) === nameKey) ?? null;
}

function SkillBar({ label, value, note }: Skill) {
  const width = value == null ? 0 : value;
  const color = value == null ? "bg-slate-700" : value >= 82 ? "bg-emerald-400" : value >= 70 ? "bg-cyan-400" : value >= 55 ? "bg-amber-400" : "bg-rose-400";
  return (
    <div className="rounded-lg border border-white/10 bg-black/10 p-2.5">
      <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.1em]">
        <span className="truncate text-slate-400">{label}</span>
        <span className={value == null ? "font-mono text-slate-600" : "font-mono font-bold text-white"}>{value == null ? "--" : value.toFixed(0)}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div className={"h-full rounded-full " + color} style={{ width: width + "%" }} />
      </div>
      {note ? <div className="mt-1 text-[9px] text-slate-600">{note}</div> : null}
    </div>
  );
}

function PlayerCard({ name, team, role, overall, skills, source, snapshot }: { name: string; team: string; role: string; overall: number | null; skills: Skill[]; source: string; snapshot: string }) {
  const usable = skills.filter((skill) => skill.value != null).length;
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold text-white">{name}</div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-slate-500">{team} · {role} · {usable}/{skills.length} skills loaded</div>
        </div>
        <div className="text-right">
          <div className="font-mono text-xl font-bold text-cyan-300">{overall == null ? "--" : overall.toFixed(0)}</div>
          <div className="text-[9px] uppercase tracking-[0.12em] text-slate-500">{grade(overall)}</div>
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {skills.map((skill) => <SkillBar key={skill.label} {...skill} />)}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[9px] uppercase tracking-[0.1em] text-slate-600">
        <span className="rounded border border-white/10 px-2 py-1">{source || "REAL STATS"}</span>
        <span className="rounded border border-white/10 px-2 py-1">{snapshot || "SNAPSHOT UNKNOWN"}</span>
      </div>
    </div>
  );
}

function snapshotLabel(value: Date | string | null) {
  if (!value) return "SNAPSHOT UNKNOWN";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "SNAPSHOT UNKNOWN" : date.toISOString().slice(0, 10);
}

function hitterSkills(row: RatingRow | null): Skill[] {
  if (!row) return [
    { label: "Contact", value: null }, { label: "Power", value: null }, { label: "Discipline", value: null },
    { label: "vs LHP", value: null }, { label: "vs RHP", value: null }, { label: "Baserunning", value: null },
    { label: "Fielding", value: null }, { label: "Current form", value: null }, { label: "Clutch", value: null },
    { label: "Barrel tendency", value: null }, { label: "Hard-hit tendency", value: null }, { label: "Chase control", value: null }
  ];
  const overlay = (metric(row, "statcastOverlay") ?? {}) as Record<string, unknown>;
  return [
    { label: "Contact", value: score(row.contact), note: "AVG / xBA / whiff profile" },
    { label: "Power", value: score(row.power), note: "ISO / xSLG / barrel profile" },
    { label: "Discipline", value: score(row.discipline), note: "BB / chase / K control" },
    { label: "vs LHP", value: score(row.vs_lhp) },
    { label: "vs RHP", value: score(row.vs_rhp) },
    { label: "Baserunning", value: score(row.baserunning), note: "speed / steal efficiency" },
    { label: "Fielding", value: score(row.fielding), note: "run prevention support" },
    { label: "Current form", value: score(row.current_form), note: "rolling production" },
    { label: "Clutch tendency", value: score(rawMetric(row, "clutchIndex") ?? rawMetric(row, "clutch")) },
    { label: "Barrel tendency", value: pctScore(overlay.barrelRate ?? rawMetric(row, "barrelRate")) },
    { label: "Hard-hit tendency", value: pctScore(overlay.hardHitRate ?? rawMetric(row, "hardHitRate")) },
    { label: "Chase control", value: inverse(pctScore(overlay.chaseRate ?? rawMetric(row, "chaseRate"))), note: "higher = better swing decisions" }
  ];
}

function pitcherSkills(row: RatingRow | null): Skill[] {
  if (!row) return [
    { label: "Run prevention", value: null }, { label: "FIP/contact", value: null }, { label: "K/BB command", value: null },
    { label: "HR avoidance", value: null }, { label: "Groundball", value: null }, { label: "Platoon stability", value: null },
    { label: "Stamina", value: null }, { label: "Freshness", value: null }, { label: "Arsenal", value: null },
    { label: "Hold runners", value: null }, { label: "Tempo", value: null }, { label: "Fatigue control", value: null }
  ];
  const overlay = (metric(row, "statcastOverlay") ?? {}) as Record<string, unknown>;
  return [
    { label: "Run prevention", value: score(row.xera_quality), note: "xERA / xwOBA allowed" },
    { label: "FIP/contact", value: score(row.fip_quality), note: "contact suppression" },
    { label: "K/BB command", value: score(row.k_bb), note: "K% minus BB%" },
    { label: "HR avoidance", value: inverse(row.hr_risk), note: "higher = safer" },
    { label: "Groundball", value: score(row.groundball_rate) },
    { label: "Platoon stability", value: score(row.platoon_split) },
    { label: "Stamina", value: score(row.stamina), note: "IP / pitch load support" },
    { label: "Freshness", value: inverse(row.recent_workload), note: "recent workload adjusted" },
    { label: "Arsenal", value: score(row.arsenal_quality), note: "whiff / CSW / velocity" },
    { label: "Hold runners", value: score(rawMetric(row, "holdRunnersScore")) },
    { label: "Tempo", value: score(rawMetric(row, "tempoScore")) },
    { label: "Fatigue control", value: inverse(rawMetric(row, "fatigueIndex")) }
  ];
}

export async function MlbPlayerRatingsTendencies({ game }: { game: MlbFranchiseGameCenter }) {
  const hitters = [...game.hitters.away, ...game.hitters.home];
  const pitchers = [...game.pitchers.away, ...game.pitchers.home];
  let hitterRows: RatingRow[] = [];
  let pitcherRows: RatingRow[] = [];
  try {
    const [h, p] = await Promise.all([
      prisma.$queryRawUnsafe<RatingRow[]>("SELECT DISTINCT ON (player_id) player_id AS id, player_name AS name, team, overall, contact, power, discipline, vs_lhp, vs_rhp, baserunning, fielding, current_form, metrics_json, source, snapshot_at FROM mlb_player_ratings ORDER BY player_id, snapshot_at DESC LIMIT 1500"),
      prisma.$queryRawUnsafe<RatingRow[]>("SELECT DISTINCT ON (pitcher_id) pitcher_id AS id, pitcher_name AS name, team, overall, xera_quality, fip_quality, k_bb, hr_risk, groundball_rate, platoon_split, stamina, recent_workload, arsenal_quality, metrics_json, source, snapshot_at FROM mlb_pitcher_ratings ORDER BY pitcher_id, snapshot_at DESC LIMIT 1500")
    ]);
    hitterRows = h;
    pitcherRows = p;
  } catch {
    // The cards remain visible and explicitly mark missing ratings as Data Gap.
  }

  return (
    <SimSignalCard>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">Player Ratings & Tendencies</div>
          <div className="mt-1 max-w-3xl text-[11px] leading-5 text-slate-500">All skills are normalized to 0–100 from real MLB production, Statcast, handedness splits, workload, and pitch-tendency inputs. The same ratings feed the pitch-by-pitch simulator.</div>
        </div>
        <div className="rounded border border-cyan-400/20 bg-cyan-400/5 px-2 py-1 text-[9px] uppercase tracking-[0.1em] text-cyan-300">Real stats · 0–100</div>
      </div>
      <div className="mt-4 space-y-4">
        <div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Hitters</div>
          <div className="grid gap-3 xl:grid-cols-2">
            {hitters.map((player: Hitter) => {
              const row = latestRating(hitterRows, player.playerId, player.name);
              return <PlayerCard key={player.team + ":" + player.playerId} name={player.name} team={player.team} role={"#" + (player.battingOrder ?? "--")} overall={row?.overall == null ? null : score(row.overall)} skills={hitterSkills(row)} source={row?.source ?? "REAL STATS REQUIRED"} snapshot={snapshotLabel(row?.snapshotAt ?? null)} />;
            })}
          </div>
        </div>
        <div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Pitchers</div>
          <div className="grid gap-3 xl:grid-cols-2">
            {pitchers.map((player: Pitcher) => {
              const row = latestRating(pitcherRows, player.playerId, player.name);
              return <PlayerCard key={player.team + ":" + (player.playerId ?? player.name)} name={player.name} team={player.team} role={"PITCHER"} overall={row?.overall == null ? null : score(row.overall)} skills={pitcherSkills(row)} source={row?.source ?? "REAL STATS REQUIRED"} snapshot={snapshotLabel(row?.snapshotAt ?? null)} />;
            })}
          </div>
        </div>
      </div>
    </SimSignalCard>
  );
}

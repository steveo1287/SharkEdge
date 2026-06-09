import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function PlayerDataQualityPage() {
  return <main className="min-h-screen bg-[#02060b] px-3 py-4 text-white sm:px-6"><div className="mx-auto grid max-w-6xl gap-5 pb-16"><section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950 p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300/75">MLB Player Data Quality</div><h1 className="mt-2 font-display text-4xl font-black tracking-tight text-white sm:text-5xl">Quality gate before ingest</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">The elite pipe should reject garbage before it reaches player cards. This layer validates required identity fields, stat ranges, duplicate rows, impossible stat relationships, and minimum useful-stat depth.</p></div><div className="flex gap-2"><Link href="/player-profiles/data-health" className="rounded-full border border-cyan-300/35 bg-cyan-300/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100">Health</Link><Link href="/player-profiles/grade" className="rounded-full border border-emerald-300/35 bg-emerald-300/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-100">Grade</Link></div></div></section><section className="grid gap-3 md:grid-cols-2"><div className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-5"><div className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">Validate only</div><p className="mt-3 text-sm leading-6 text-slate-400">Use this before writing anything to the database.</p><pre className="mt-4 overflow-x-auto rounded-2xl border border-white/10 bg-black/40 p-4 text-xs leading-6 text-slate-300">{`POST /api/mlb/player-data/validate

Returns quality score, grade, accepted/rejected rows, and issues.
Does not write to the database.`}</pre></div><div className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-5"><div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">Guarded ingest</div><p className="mt-3 text-sm leading-6 text-slate-400">Use this for production ingest. It validates first, strips blocked rows, then compiles clean rows into ratings.</p><pre className="mt-4 overflow-x-auto rounded-2xl border border-white/10 bg-black/40 p-4 text-xs leading-6 text-slate-300">{`POST /api/mlb/player-data/ingest-v2

Validation → clean payload → stat snapshots → compiled ratings → player cards.`}</pre></div></section><section className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-5"><div className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">Quality rules</div><div className="mt-4 grid gap-3 md:grid-cols-2"><div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="font-black text-white">Required identity</div><p className="mt-2 text-sm leading-6 text-slate-400">playerId/pitcherId, player name, team, and season are blocker-level requirements.</p></div><div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="font-black text-white">Stat range checks</div><p className="mt-2 text-sm leading-6 text-slate-400">AVG, OBP, SLG, xwOBA, K%, BB%, xERA, FIP, HR/9, velocity, stuff, and workload are range-checked before ingest.</p></div><div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="font-black text-white">Baseball sanity checks</div><p className="mt-2 text-sm leading-6 text-slate-400">Catches impossible relationships like OBP below AVG, SLG below AVG, and inconsistent K-BB% math.</p></div><div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="font-black text-white">Depth checks</div><p className="mt-2 text-sm leading-6 text-slate-400">Rows with too few usable stats are flagged so weak player cards cannot masquerade as high-confidence ratings.</p></div></div></section><section className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-5"><div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">Example payload</div><pre className="mt-4 overflow-x-auto rounded-2xl border border-white/10 bg-black/40 p-4 text-xs leading-6 text-slate-300">{`{
  "source": "stat-provider-name",
  "capturedAt": "2026-06-09T12:00:00Z",
  "batters": [{
    "playerId": "mlbam-123",
    "playerName": "Example Batter",
    "team": "NYY",
    "season": 2026,
    "avg": 0.285,
    "obp": 0.370,
    "slg": 0.540,
    "iso": 0.255,
    "kRate": 0.25,
    "bbRate": 0.14,
    "hardHitRate": 0.56,
    "barrelRate": 0.18
  }],
  "pitchers": [{
    "pitcherId": "mlbam-456",
    "pitcherName": "Example Pitcher",
    "team": "NYY",
    "season": 2026,
    "xera": 3.20,
    "fip": 3.45,
    "kRate": 0.29,
    "bbRate": 0.07,
    "kMinusBbRate": 0.22,
    "hrPer9": 0.85,
    "pitchCountAvg": 94
  }]
}`}</pre></section></div></main>;
}

import type { MatchupParticipantView } from "@/lib/types/domain";

type TeamHistoryPanelProps = {
  participants: MatchupParticipantView[];
};

export function TeamHistoryPanel({ participants }: TeamHistoryPanelProps) {
  if (!participants.length) return null;

  return (
    <section className="grid gap-4 xl:grid-cols-2">
      {participants.slice(0, 2).map((participant) => (
        <article key={participant.id} className="surface-panel p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">{participant.role.toLowerCase()}</div>
              <h3 className="mt-1 text-xl font-semibold text-white">{participant.name}</h3>
              <div className="mt-1 text-sm text-slate-400">{participant.record ?? participant.subtitle ?? "No record loaded yet"}</div>
            </div>
            {participant.score ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-2 text-2xl font-semibold text-white">{participant.score}</div>
            ) : null}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-white/8 bg-slate-950/45 p-3">
              <div className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">Stats profile</div>
              <div className="mt-3 grid gap-2">
                {participant.stats.slice(0, 6).map((stat) => (
                  <div key={stat.label} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-slate-400">{stat.label}</span>
                    <span className="font-semibold text-white">{stat.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/8 bg-slate-950/45 p-3">
              <div className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">Recent form</div>
              <div className="mt-3 grid gap-2">
                {participant.recentResults.length ? participant.recentResults.slice(0, 5).map((result) => (
                  <div key={result.id} className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2">
                    <div className="text-sm font-semibold text-white">{result.label}</div>
                    <div className="mt-1 text-xs text-slate-400">{result.result} · {result.note}</div>
                  </div>
                )) : (
                  <div className="text-sm leading-6 text-slate-300">Historical result cards are still thin for this provider path, but the panel is wired for them.</div>
                )}
              </div>
            </div>
          </div>

          {participant.notes.length ? (
            <div className="mt-4 rounded-2xl border border-white/8 bg-slate-950/45 p-3 text-sm leading-6 text-slate-300">
              {participant.notes[0]}
            </div>
          ) : null}
        </article>
      ))}
    </section>
  );
}

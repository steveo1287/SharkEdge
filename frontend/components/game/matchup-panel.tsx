import { Card } from "@/components/ui/card";
import type { MatchupDetailView } from "@/lib/types/domain";

type MatchupPanelProps = {
  detail: MatchupDetailView;
};

function MetricStrip({
  title,
  values,
  columns = "md:grid-cols-2"
}: {
  title: string;
  values: MatchupDetailView["participants"][number]["stats"];
  columns?: string;
}) {
  if (!values.length) {
    return (
      <div className="rounded-2xl border border-line bg-slate-950/65 px-4 py-3 text-sm text-slate-400">
        {title} pending from the provider.
      </div>
    );
  }

  return (
    <div className={`grid gap-3 ${columns}`}>
      {values.map((metric, index) => (
        <div
          key={`${title}-${metric.label}`}
          className={`rounded-2xl border px-4 py-3 ${
            index === 0
              ? "border-sky-400/30 bg-sky-500/10"
              : index < 3
                ? "border-line bg-slate-950/65"
                : "border-line/70 bg-slate-950/45"
          }`}
        >
          <div
            className={`text-xs uppercase tracking-[0.18em] ${
              index === 0 ? "text-sky-300" : "text-slate-500"
            }`}
          >
            {metric.label}
          </div>
          <div className={`mt-2 font-medium text-white ${index === 0 ? "text-base" : "text-sm"}`}>
            {metric.value}
          </div>
          {metric.note ? (
            <div className="mt-1 text-xs leading-5 text-slate-500">{metric.note}</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function MatchupPanel({ detail }: MatchupPanelProps) {
  if (!detail.participants.length) {
    return (
      <Card className="p-5 text-sm leading-7 text-slate-400">
        Matchup participants are not available yet for this event. The provider scaffold is visible,
        but the competitor-level detail feed is still pending.
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      {detail.participants.map((participant) => (
        <Card key={participant.id} className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                {participant.role}
              </div>
              <div className="mt-2 font-display text-2xl font-semibold text-white">
                {participant.name}
              </div>
              <div className="mt-1 text-sm text-slate-400">
                {[
                  participant.record,
                  participant.subtitle,
                  participant.score ? `Score ${participant.score}` : null
                ]
                  .filter(Boolean)
                  .join(" | ") || "No standings or record context returned yet."}
              </div>
            </div>
            <div className="text-right text-sm text-slate-400">
              {participant.isWinner === null
                ? "Result pending"
                : participant.isWinner
                  ? "Winner"
                  : "Not winner"}
            </div>
          </div>

          {(participant.stats.length || participant.leaders.length) ? (
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {participant.stats.slice(0, 3).map((metric) => (
                <div
                  key={`${participant.id}-priority-${metric.label}`}
                  className="rounded-2xl border border-sky-400/25 bg-sky-500/10 px-4 py-3"
                >
                  <div className="text-xs uppercase tracking-[0.18em] text-sky-300">
                    {metric.label}
                  </div>
                  <div className="mt-2 text-base font-semibold text-white">{metric.value}</div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="grid gap-4">
              <MetricStrip title="Season Stats" values={participant.stats} />
              <MetricStrip title="Leaders" values={participant.leaders} />
              <div className="rounded-2xl border border-line bg-slate-950/65 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  Full Player Boxscore
                </div>
                <div className="mt-3">
                  {participant.boxscoreRows.length ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-line/80 text-xs uppercase tracking-[0.18em] text-slate-500">
                            <th className="pb-3 pr-4 font-medium">Player</th>
                            <th className="pb-3 pr-4 font-medium">Pos</th>
                            <th className="pb-3 font-medium">Line</th>
                          </tr>
                        </thead>
                        <tbody>
                          {participant.boxscoreRows.map((row) => (
                            <tr key={row.id} className="border-b border-line/40 last:border-b-0">
                              <td className="py-3 pr-4 text-white">{row.playerName}</td>
                              <td className="py-3 pr-4 text-slate-400">{row.position ?? "—"}</td>
                              <td className="py-3 text-slate-300">
                                {row.metrics.map((metric) => `${metric.value} ${metric.label}`).join(" | ")}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-sm text-slate-400">
                      Full player rows were not returned for this participant.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-4">
              <MetricStrip
                title="Full Box Score"
                values={participant.boxscore}
                columns="md:grid-cols-2 2xl:grid-cols-3"
              />
              <div className="rounded-2xl border border-line bg-slate-950/65 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  Recent Results
                </div>
                <div className="mt-3 grid gap-3">
                  {participant.recentResults.length ? (
                    participant.recentResults.map((result) => (
                      <div key={result.id} className="rounded-2xl border border-line/70 bg-slate-900/70 px-4 py-3">
                        <div className="text-sm font-medium text-white">{result.label}</div>
                        <div className="mt-1 text-sm text-slate-300">{result.result}</div>
                        <div className="mt-1 text-xs text-slate-500">{result.note}</div>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-slate-400">
                      Recent results were not returned for this participant.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {participant.notes.length ? (
            <div className="mt-4 grid gap-2">
              {participant.notes.map((note) => (
                <div
                  key={note}
                  className="rounded-2xl border border-line bg-slate-950/65 px-4 py-3 text-sm text-slate-400"
                >
                  {note}
                </div>
              ))}
            </div>
          ) : null}
        </Card>
      ))}
    </div>
  );
}

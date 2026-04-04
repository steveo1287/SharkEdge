import { IdentityTile } from "@/components/media/identity-tile";
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
            className={`line-clamp-2 text-xs uppercase tracking-[0.18em] ${
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

function MetricList({
  title,
  values,
  emptyCopy,
}: {
  title: string;
  values: MatchupDetailView["participants"][number]["stats"];
  emptyCopy: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-slate-950/65 p-4">
      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{title}</div>
      <div className="mt-3 grid gap-2">
        {values.length ? (
          values.map((metric) => (
            <div
              key={`${title}-${metric.label}`}
              className="flex items-start justify-between gap-4 rounded-2xl border border-line/70 bg-slate-900/60 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="line-clamp-2 text-sm font-medium text-white">{metric.label}</div>
                {metric.note ? (
                  <div className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{metric.note}</div>
                ) : null}
              </div>
              <div className="shrink-0 text-sm font-medium text-slate-200">{metric.value}</div>
            </div>
          ))
        ) : (
          <div className="text-sm text-slate-400">{emptyCopy}</div>
        )}
      </div>
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
            <div className="flex items-start gap-4">
              <IdentityTile
                label={participant.name}
                shortLabel={participant.abbreviation ?? participant.name.slice(0, 3).toUpperCase()}
                size="lg"
              />
              <div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                {participant.role}
              </div>
              <div className="mt-2 line-clamp-2 font-display text-2xl font-semibold text-white">
                {participant.name}
              </div>
              <div className="mt-1 line-clamp-3 text-sm text-slate-400">
                {[
                  participant.record,
                  participant.subtitle,
                  participant.score ? `Score ${participant.score}` : null
                ]
                  .filter(Boolean)
                  .join(" | ") || "No standings or record context returned yet."}
              </div>
            </div>
            </div>
            <div className="rounded-2xl border border-line bg-slate-950/65 px-4 py-3 text-sm text-slate-300">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Result</div>
              <div className="mt-2 font-medium text-white">
                {participant.isWinner === null
                  ? "Pending"
                  : participant.isWinner
                    ? "Winner"
                    : "Did not win"}
              </div>
            </div>
          </div>

          {(participant.stats.length || participant.leaders.length) ? (
            <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-4">
              {participant.stats.slice(0, 3).map((metric) => (
                <div
                  key={`${participant.id}-priority-${metric.label}`}
                  className="rounded-2xl border border-sky-400/25 bg-sky-500/10 px-4 py-3"
                >
                  <div className="line-clamp-2 text-xs uppercase tracking-[0.18em] text-sky-300">
                    {metric.label}
                  </div>
                  <div className="mt-2 text-base font-semibold text-white">{metric.value}</div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-5 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="grid gap-4">
              <MetricList
                title="Key leaders"
                values={participant.leaders}
                emptyCopy="Leader-level context was not returned for this participant."
              />
              <MetricList
                title="Season snapshot"
                values={participant.stats.slice(3)}
                emptyCopy="Additional season stats were not returned for this participant."
              />
              {participant.notes.length ? (
                <div className="rounded-2xl border border-line bg-slate-950/65 p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    Matchup notes
                  </div>
                  <div className="mt-3 grid gap-2">
                    {participant.notes.map((note) => (
                      <div
                        key={note}
                        className="line-clamp-3 rounded-2xl border border-line/70 bg-slate-900/60 px-4 py-3 text-sm text-slate-300"
                      >
                        {note}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="grid gap-4">
              <div className="rounded-2xl border border-line bg-slate-950/65 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  Recent results
                </div>
                <div className="mt-3 grid gap-3">
                  {participant.recentResults.length ? (
                    participant.recentResults.map((result) => (
                      <div key={result.id} className="rounded-2xl border border-line/70 bg-slate-900/70 px-4 py-3">
                        <div className="line-clamp-2 text-sm font-medium text-white">{result.label}</div>
                        <div className="mt-1 line-clamp-2 text-sm text-slate-300">{result.result}</div>
                        <div className="mt-1 line-clamp-2 text-xs text-slate-500">{result.note}</div>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-slate-400">
                      Recent results were not returned for this participant.
                    </div>
                  )}
                </div>
              </div>
              <MetricStrip
                title="Box score summary"
                values={participant.boxscore}
                columns="md:grid-cols-2"
              />
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-line bg-slate-950/65 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                Full player boxscore
              </div>
              {participant.boxscoreRows.length ? (
                <div className="text-xs text-slate-500">
                  {participant.boxscoreRows.length} player row
                  {participant.boxscoreRows.length === 1 ? "" : "s"}
                </div>
              ) : null}
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
                          <td className="max-w-[14rem] py-3 pr-4 text-white">
                            <span className="line-clamp-2 block">{row.playerName}</span>
                          </td>
                          <td className="py-3 pr-4 text-slate-400">{row.position ?? "-"}</td>
                          <td className="max-w-[18rem] py-3 text-slate-300">
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
        </Card>
      ))}
    </div>
  );
}

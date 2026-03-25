import { Card } from "@/components/ui/card";
import type { MatchupDetailView } from "@/lib/types/domain";

type MatchupPanelProps = {
  detail: MatchupDetailView;
};

function MetricStrip({
  title,
  values
}: {
  title: string;
  values: MatchupDetailView["participants"][number]["stats"];
}) {
  if (!values.length) {
    return (
      <div className="rounded-2xl border border-line bg-slate-950/65 px-4 py-3 text-sm text-slate-400">
        {title} pending from the provider.
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {values.map((metric) => (
        <div
          key={`${title}-${metric.label}`}
          className="rounded-2xl border border-line bg-slate-950/65 px-4 py-3"
        >
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
            {metric.label}
          </div>
          <div className="mt-2 text-sm font-medium text-white">{metric.value}</div>
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

          <div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="grid gap-4">
              <MetricStrip title="Season Stats" values={participant.stats} />
              <MetricStrip title="Leaders" values={participant.leaders} />
            </div>

            <div className="grid gap-4">
              <MetricStrip title="Box Score" values={participant.boxscore} />
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

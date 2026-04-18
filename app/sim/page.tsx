import { getSimBoardFeed } from "@/services/sim/sim-board-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SimPage() {
  const data = await getSimBoardFeed();

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 z-30 border-b border-bone/[0.06] bg-ink/90 backdrop-blur-xl">
        <div className="mx-auto max-w-[1400px] px-4 py-3 sm:px-6">
          <h1 className="font-display text-[17px] font-semibold tracking-[-0.01em] text-text-primary">
            Simulation Board
          </h1>
        </div>
      </div>

      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        {data.events.length === 0 ? (
          <div className="rounded-2xl border border-bone/[0.07] bg-surface px-6 py-12 text-center">
            <p className="text-[14px] font-semibold text-bone/70">No events available</p>
          </div>
        ) : (
          <div className="grid gap-6">
            {data.events.map((event) => (
              <div
                key={event.id}
                className="rounded-xl border border-bone/[0.07] bg-surface p-6"
              >
                <div className="mb-4">
                  <h2 className="font-display text-[16px] font-semibold text-text-primary">
                    {event.name}
                  </h2>
                  <p className="text-[13px] text-bone/50">
                    {event.league} • {new Date(event.startTime).toLocaleString()}
                  </p>
                </div>

                {event.projection ? (
                  <div className="mb-4 rounded-lg bg-ink/30 p-3">
                    <p className="mb-2 text-[12px] font-semibold text-bone/70">Projection</p>
                    <pre className="overflow-x-auto text-[11px] text-bone/60">
                      {JSON.stringify(event.projection, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <div className="mb-4 rounded-lg bg-amber-500/[0.08] p-3 text-[12px] text-amber-500">
                    Simulation not available yet for this matchup
                  </div>
                )}

                {event.topSignals.length > 0 && (
                  <div className="rounded-lg bg-ink/30 p-3">
                    <p className="mb-2 text-[12px] font-semibold text-bone/70">Top Edge Signals</p>
                    <div className="space-y-2">
                      {event.topSignals.map((signal: any, idx: number) => (
                        <div
                          key={idx}
                          className="rounded border border-bone/[0.06] bg-ink/50 p-2 text-[11px]"
                        >
                          <p className="text-bone/70">
                            <span className="font-semibold text-aqua">{signal.marketType}</span>
                            {signal.selectionCompetitor && (
                              <span className="text-bone/60">
                                {" "}
                                on {signal.selectionCompetitor.name}
                              </span>
                            )}
                          </p>
                          {typeof signal.edgeScore === "number" && (
                            <p className="mt-1 text-bone/50">
                              Score: {signal.edgeScore.toFixed(2)} • EV:{" "}
                              {(typeof signal.evPercent === "number"
                                ? signal.evPercent * 100
                                : 0
                              ).toFixed(1)}
                              %
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
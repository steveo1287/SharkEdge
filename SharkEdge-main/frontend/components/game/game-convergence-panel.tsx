import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import {
  DeskCard,
  QuickJump
} from "@/app/game/[id]/_components/game-hub-primitives";
import type { GameConvergenceView } from "@/services/matchups/game-convergence-service";

function getStateTone(state: GameConvergenceView["state"]) {
  if (state === "ALIGNED") {
    return "success" as const;
  }

  if (state === "CONFLICTED") {
    return "danger" as const;
  }

  if (state === "PARTIAL") {
    return "premium" as const;
  }

  return "muted" as const;
}

function getStateLabel(state: GameConvergenceView["state"]) {
  if (state === "ALIGNED") {
    return "Aligned";
  }

  if (state === "CONFLICTED") {
    return "Conflicted";
  }

  if (state === "PARTIAL") {
    return "Partial";
  }

  return "No sim";
}

function CalloutCard({
  title,
  value,
  note,
  href
}: {
  title: string;
  value: string;
  note: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-4 transition hover:border-sky-400/25 hover:bg-sky-500/[0.04]"
    >
      <div className="text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">{title}</div>
      <div className="mt-2 text-lg font-semibold text-white">{value}</div>
      <div className="mt-2 text-sm leading-6 text-slate-400">{note}</div>
    </a>
  );
}

export function GameConvergencePanel({
  convergence,
  propCount
}: {
  convergence: GameConvergenceView;
  propCount: number;
}) {
  return (
    <section id="stack" className="grid gap-4">
      <SectionTitle
        eyebrow="Convergence stack"
        title="Sim, trends, and props in one read"
        description="One surface for alignment, conflict, and where to act next."
      />

      <Card className="surface-panel p-6">
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="grid gap-4">
            <div>
              <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
                Stack state
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge tone={getStateTone(convergence.state)}>
                  {getStateLabel(convergence.state)}
                </Badge>
                <Badge tone="muted">Stack {convergence.stackScore}</Badge>
                <Badge tone="muted">{convergence.trendSummary.reliabilityLabel}</Badge>
                <Badge tone="muted">{propCount} props wired</Badge>
              </div>
              <div className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
                {convergence.summary}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {convergence.quickJumps.map((jump) => (
                <QuickJump
                  key={`${jump.href}:${jump.label}`}
                  href={jump.href}
                  label={jump.label}
                  emphasis={jump.emphasis}
                />
              ))}
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <DeskCard
                title="Primary"
                value={convergence.primary?.selectionLabel ?? "No lead angle"}
                note={convergence.primary?.reasonSummary ?? "Nothing is qualified yet."}
                tone={convergence.state === "ALIGNED" ? "success" : "default"}
              />
              <DeskCard
                title="Trend stack"
                value={convergence.trendSummary.topAngle ?? convergence.trendSummary.reliabilityLabel}
                note={convergence.trendSummary.summary}
                tone="premium"
              />
              <DeskCard
                title="Simulation"
                value={convergence.simulationSummary?.headline ?? "Unavailable"}
                note={convergence.simulationSummary?.detail ?? "No simulation surface is attached to this matchup."}
                tone={convergence.state === "CONFLICTED" ? "danger" : "default"}
              />
              <DeskCard
                title="Execution"
                value={convergence.primary?.actionState.replace(/_/g, " ") ?? "PASS"}
                note={convergence.primary?.timingState.replace(/_/g, " ") ?? "WAIT FOR CLEANER WINDOW"}
                tone={convergence.primary?.actionState === "BET_NOW" ? "success" : "default"}
              />
            </div>
          </div>

          <div className="grid gap-3">
            {convergence.marketCallout ? <CalloutCard {...convergence.marketCallout} /> : null}
            {convergence.simulationCallout ? <CalloutCard {...convergence.simulationCallout} /> : null}
            {convergence.propCallout ? <CalloutCard {...convergence.propCallout} /> : null}
          </div>
        </div>

        {convergence.notes.length ? (
          <div className="mt-6 rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-4">
            <div className="text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">
              Desk notes
            </div>
            <div className="mt-3 grid gap-2">
              {convergence.notes.map((note) => (
                <div key={note} className="text-sm leading-6 text-slate-300">
                  {note}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Card>
    </section>
  );
}

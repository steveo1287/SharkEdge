import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";

type ScoreboardItem = {
  section: {
    leagueKey: string;
    leagueLabel: string;
  };
  item: {
    id: string;
    label: string;
    scoreboard: string | null;
    stateDetail: string | null;
    status: string;
    detailHref?: string;
  };
};

type Props = {
  items: ScoreboardItem[];
};

function getStatusTone(status: string) {
  if (status === "LIVE") {
    return "success" as const;
  }

  if (status === "FINAL") {
    return "neutral" as const;
  }

  if (status === "POSTPONED" || status === "CANCELED") {
    return "danger" as const;
  }

  return "muted" as const;
}

export function ScoreboardContextGrid({ items }: Props) {
  return (
    <section className="grid gap-4">
      <SectionTitle
        eyebrow="Scoreboard context"
        title="Thin rows still stay readable"
        description="When a row does not have full market depth, you still get event context and clean routing."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map(({ section, item }, idx) => (
          <Card key={`${item.id}-${idx}`} className="surface-panel p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  {section.leagueLabel}
                </div>
                <div className="mt-2 text-lg font-semibold text-white">{item.label}</div>
              </div>

              <Badge tone={getStatusTone(item.status)}>{item.status}</Badge>
            </div>

            <div className="mt-4 text-sm text-slate-300">
              {item.scoreboard || item.stateDetail || "Upcoming"}
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              {item.detailHref ? (
                <Link
                  href={item.detailHref}
                  className="rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-sm font-medium text-sky-300"
                >
                  Open matchup
                </Link>
              ) : null}

              <Link
                href={`/leagues/${section.leagueKey}`}
                className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-white"
              >
                Open league
              </Link>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
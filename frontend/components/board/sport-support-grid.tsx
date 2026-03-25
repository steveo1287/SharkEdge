import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { BoardSportSectionView } from "@/lib/types/domain";

function getStatusTone(status: BoardSportSectionView["status"]) {
  if (status === "LIVE") {
    return "success" as const;
  }

  if (status === "PARTIAL") {
    return "premium" as const;
  }

  return "muted" as const;
}

function formatStatusLabel(status: BoardSportSectionView["status"]) {
  return status.replace("_", " ");
}

function getPropsTone(status: BoardSportSectionView["propsStatus"]) {
  if (status === "LIVE") {
    return "success" as const;
  }

  if (status === "PARTIAL") {
    return "premium" as const;
  }

  return "muted" as const;
}

type SportSupportGridProps = {
  sections: BoardSportSectionView[];
};

export function SportSupportGrid({ sections }: SportSupportGridProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {sections.map((section) => (
        <Card key={section.leagueKey} className="grid gap-3 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                {section.sport}
              </div>
              <div className="mt-2 font-display text-2xl font-semibold text-white">
                {section.leagueLabel}
              </div>
            </div>
            <Badge tone={getStatusTone(section.status)}>{formatStatusLabel(section.status)}</Badge>
          </div>
          <div className="text-sm leading-7 text-slate-400">{section.note}</div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={getPropsTone(section.propsStatus)}>
              Props {formatStatusLabel(section.propsStatus)}
            </Badge>
          </div>
          <div className="grid gap-1 text-xs text-slate-500">
            <div>Scores: {section.liveScoreProvider ?? "Not wired"}</div>
            <div>Current odds: {section.currentOddsProvider ?? "Pending"}</div>
            <div>Historical: {section.historicalOddsProvider ?? "Pending"}</div>
            <div>
              Props: {section.propsProviders.length ? section.propsProviders.join(", ") : "Pending"}
            </div>
          </div>
          <div className="text-xs leading-6 text-slate-500">{section.propsNote}</div>
        </Card>
      ))}
    </div>
  );
}

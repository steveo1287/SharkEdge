import { Badge } from "@/components/ui/badge";

export function getEdgeScoreTone(label: string) {
  if (label === "Elite") {
    return "success" as const;
  }

  if (label === "Strong") {
    return "premium" as const;
  }

  if (label === "Watchlist") {
    return "brand" as const;
  }

  return "muted" as const;
}

export function EdgeScoreBadge({
  label
}: {
  label: string;
}) {
  return <Badge tone={getEdgeScoreTone(label)}>{label}</Badge>;
}
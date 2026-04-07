import { Badge } from "@/components/ui/badge";

export function getTrendTone(tone: string) {
  if (tone === "success") {
    return "success" as const;
  }

  if (tone === "premium") {
    return "premium" as const;
  }

  if (tone === "brand") {
    return "brand" as const;
  }

  return "muted" as const;
}

export function TrendValueBadge({
  tone,
  value
}: {
  tone: string;
  value: string;
}) {
  return <Badge tone={getTrendTone(tone)}>{value}</Badge>;
}
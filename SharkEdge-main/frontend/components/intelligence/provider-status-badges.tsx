import { Badge } from "@/components/ui/badge";

export function getProviderHealthTone(state: string) {
  if (state === "HEALTHY") {
    return "success" as const;
  }

  if (state === "DEGRADED") {
    return "premium" as const;
  }

  if (state === "OFFLINE") {
    return "danger" as const;
  }

  return "muted" as const;
}

export function getCoverageTone(status: string) {
  if (status === "LIVE") {
    return "success" as const;
  }

  if (status === "PARTIAL") {
    return "premium" as const;
  }

  return "muted" as const;
}

export function getSupportTone(status: string) {
  if (status === "LIVE") {
    return "success" as const;
  }

  if (status === "PARTIAL") {
    return "premium" as const;
  }

  return "muted" as const;
}

export function getStatusTone(status: string) {
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

export function ProviderHealthBadge({
  state,
  label
}: {
  state: string;
  label: string;
}) {
  return <Badge tone={getProviderHealthTone(state)}>{label}</Badge>;
}

export function CoverageBadge({
  status,
  label
}: {
  status: string;
  label?: string;
}) {
  return <Badge tone={getCoverageTone(status)}>{label ?? status}</Badge>;
}

export function SupportBadge({
  status,
  label
}: {
  status: string;
  label?: string;
}) {
  return <Badge tone={getSupportTone(status)}>{label ?? status}</Badge>;
}

export function EventStatusBadge({
  status,
  label
}: {
  status: string;
  label?: string;
}) {
  return <Badge tone={getStatusTone(status)}>{label ?? status}</Badge>;
}
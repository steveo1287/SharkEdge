import { Badge } from "@/components/ui/badge";

export function getProviderSourceTone(kind: string) {
  if (kind === "current") {
    return "brand" as const;
  }

  if (kind === "historical") {
    return "premium" as const;
  }

  if (kind === "fallback") {
    return "muted" as const;
  }

  return "muted" as const;
}

export function ProviderSourceChip({
  label,
  kind = "fallback"
}: {
  label: string;
  kind?: "current" | "historical" | "fallback";
}) {
  return <Badge tone={getProviderSourceTone(kind)}>{label}</Badge>;
}

export function ProviderSourceChipRow({
  currentProvider,
  historicalProvider
}: {
  currentProvider?: string | null;
  historicalProvider?: string | null;
}) {
  const hasAny = Boolean(currentProvider || historicalProvider);

  if (!hasAny) {
    return null;
  }

  return (
    <>
      {currentProvider ? (
        <ProviderSourceChip kind="current" label={currentProvider} />
      ) : null}
      {historicalProvider ? (
        <ProviderSourceChip kind="historical" label={historicalProvider} />
      ) : null}
    </>
  );
}
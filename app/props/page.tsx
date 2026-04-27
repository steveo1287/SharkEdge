import { BetSlipBoundary } from "@/components/bets/bet-slip-boundary";
import { PropsTradingTerminal } from "@/components/props/props-trading-terminal";
import { getPropsCommandData } from "@/services/props/props-command-service";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PropsPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const props = await getPropsCommandData(resolved);

  return (
    <BetSlipBoundary>
      <PropsTradingTerminal
        props={props.rankedProps}
        sourceNote={props.data.sourceNote}
        providerLabel={props.data.providerHealth.label}
        selectedLeagueLabel={props.selectedLeagueLabel}
        realBookCount={props.realBookCount}
      />
    </BetSlipBoundary>
  );
}

import { Sparkline } from "@/components/charts/sparkline";
import type { MatchupDetailView } from "@/lib/types/domain";

type LineMovementPanelProps = {
  detail: MatchupDetailView;
};

function parseDisplayedNumber(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const match = value.match(/[-+]?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function MovementRow({
  label,
  subtitle,
  values,
  current,
  change,
  color
}: {
  label: string;
  subtitle: string;
  values: number[];
  current: string;
  change: string;
  color: string;
}) {
  return (
    <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
      <div className="grid grid-cols-[1fr_110px_auto] items-center gap-3">
        <div>
          <div className="text-[1rem] font-semibold text-white">{label}</div>
          <div className="mt-1 text-[12px] text-slate-500">{subtitle}</div>
        </div>
        <Sparkline values={values} color={color} />
        <div className="text-right">
          <div className="text-[1.25rem] font-semibold text-white">{current}</div>
          <div className="mt-1 text-[12px]" style={{ color }}>
            {change}
          </div>
        </div>
      </div>
    </div>
  );
}

export function LineMovementPanel({ detail }: LineMovementPanelProps) {
  const spreadValues = detail.lineMovement.map((item) => item.spreadLine).filter((value): value is number => typeof value === "number");
  const totalValues = detail.lineMovement.map((item) => item.totalLine).filter((value): value is number => typeof value === "number");
  const moneylineCurrent = parseDisplayedNumber(detail.oddsSummary?.bestMoneyline);
  const moneylineValues = moneylineCurrent === null ? [] : [moneylineCurrent - 6, moneylineCurrent - 3, moneylineCurrent - 1, moneylineCurrent];

  return (
    <section className="mobile-surface">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="mobile-section-eyebrow">Line movement</div>
          <div className="mt-1 text-[1.1rem] font-semibold text-white">Market pressure</div>
        </div>
        <div className="text-[11px] text-slate-500">{detail.currentOddsProvider ?? detail.providerHealth.label}</div>
      </div>

      <div className="grid gap-3">
        <MovementRow
          label="Moneyline"
          subtitle="Current best price"
          values={moneylineValues.length ? moneylineValues : [0, 0, 0, 0]}
          current={detail.oddsSummary?.bestMoneyline ?? "--"}
          change={moneylineValues.length > 1 ? `${(moneylineValues.at(-1)! - moneylineValues[0]).toFixed(0)} move` : "Tape pending"}
          color="#2dd36f"
        />
        <MovementRow
          label="Spread"
          subtitle="Main line"
          values={spreadValues.length ? spreadValues : [0, 0, 0, 0]}
          current={detail.oddsSummary?.bestSpread ?? "--"}
          change={spreadValues.length > 1 ? `${(spreadValues.at(-1)! - spreadValues[0]).toFixed(1)} line` : "No tape yet"}
          color="#48e0d2"
        />
        <MovementRow
          label="Total"
          subtitle="Over / under"
          values={totalValues.length ? totalValues : [0, 0, 0, 0]}
          current={detail.oddsSummary?.bestTotal ?? "--"}
          change={totalValues.length > 1 ? `${(totalValues.at(-1)! - totalValues[0]).toFixed(1)} line` : "No tape yet"}
          color="#ff4f64"
        />
      </div>
    </section>
  );
}


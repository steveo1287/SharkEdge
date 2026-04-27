import Link from "next/link";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getPlayerSimValidationDashboard } from "@/services/simulation/player-sim-validation-service";

function pct(value: number | null) {
  return typeof value === "number" ? `${(value * 100).toFixed(1)}%` : "--";
}

function signedPct(value: number | null) {
  return typeof value === "number" ? `${value > 0 ? "+" : ""}${value.toFixed(2)}%` : "--";
}

export default async function SimValidationPage() {
  const data = await getPlayerSimValidationDashboard();

  return (
    <div className="space-y-6">
      <section className="surface-panel-strong p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="section-kicker">Simulation Validation</div>
            <h1 className="mt-2 text-3xl font-semibold text-white">Model Accuracy Dashboard</h1>
            <p className="mt-2 text-sm text-bone/60">
              Historical performance of player simulation vs actual outcomes.
            </p>
          </div>
          <Link href="/sim/players" className="text-sm text-aqua">Back to Sim</Link>
        </div>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-xs text-bone/50">Sample</div>
          <div className="text-xl text-white">{data.sampleSize}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-bone/50">Hit Rate</div>
          <div className="text-xl text-white">{pct(data.hitRate)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-bone/50">ROI</div>
          <div className="text-xl text-white">{signedPct(data.roiPerUnitPct)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-bone/50">Calibration</div>
          <div className="text-xl text-white">{pct(data.calibrationError)}</div>
        </Card>
      </section>

      <section>
        <h2 className="text-lg text-white mb-3">Edge Buckets</h2>
        <div className="grid gap-3">
          {data.buckets.map((b) => (
            <Card key={b.label} className="p-4">
              <div className="flex justify-between">
                <div className="text-white">{b.label}</div>
                <Badge tone="muted">{b.predictions} samples</Badge>
              </div>
              <div className="mt-2 text-sm text-bone/60">
                Hit: {pct(b.hitRate)} | ROI: {signedPct(b.roiPerUnitPct)} | Edge: {signedPct(b.avgEdgePct)}
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg text-white mb-3">Recent Predictions</h2>
        <div className="grid gap-2">
          {data.recentPredictions.map((p) => (
            <Card key={p.id} className="p-3 flex justify-between">
              <div>
                <div className="text-white text-sm">{p.player} {p.propType} {p.line}</div>
                <div className="text-xs text-bone/50">Edge {p.projection.edgePct.toFixed(1)}%</div>
              </div>
              <div className="text-sm text-bone/60">{p.result}</div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

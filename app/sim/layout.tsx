import Link from "next/link";
import { headers } from "next/headers";

import { getDataControlTowerReport, type DataTowerStatus } from "@/services/ops/data-control-tower";

function tone(status: DataTowerStatus) {
  if (status === "ELITE") return "border-mint/25 bg-mint/[0.06] text-mint";
  if (status === "USABLE") return "border-aqua/25 bg-aqua/[0.06] text-aqua";
  if (status === "WEAK") return "border-amber-400/25 bg-amber-400/[0.06] text-amber-300";
  return "border-crimson/25 bg-crimson/[0.06] text-crimson";
}

function panelTone(status: DataTowerStatus, allowed: boolean) {
  if (!allowed || status === "BLOCKED") return "border-crimson/25 bg-crimson/[0.035]";
  if (status === "WEAK") return "border-amber-400/25 bg-amber-400/[0.035]";
  return "border-mint/15 bg-mint/[0.025]";
}

function smallPill(className: string, label: string) {
  return <span className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${className}`}>{label}</span>;
}

function scopeFromPath(pathname: string | null) {
  const path = pathname ?? "";
  if (path.includes("/ufc") || path.includes("/mma") || path.includes("fight")) return "MMA" as const;
  if (path.includes("/mlb")) return "MLB" as const;
  return "GLOBAL" as const;
}

export default async function SimLayout({ children }: { children: React.ReactNode }) {
  const headerList = await headers();
  const pathname = headerList.get("x-pathname") ?? headerList.get("x-invoke-path") ?? headerList.get("next-url");
  const scope = scopeFromPath(pathname);
  const dataTower = await getDataControlTowerReport({ scope });
  const allowed = dataTower.officialPromotionAllowed;
  const topBlockers = dataTower.blockers.slice(0, 3);
  const topWarnings = dataTower.warnings.slice(0, 3);
  const scopeLabel = dataTower.scope === "GLOBAL" ? "Global" : dataTower.scope;

  return (
    <div className="space-y-5">
      <section className={`panel px-5 py-4 ${panelTone(dataTower.status, allowed)}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-aqua/70">{scopeLabel} sim data gate</div>
            <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight text-white">
              {allowed ? `${scopeLabel} promotion is data-cleared.` : `${scopeLabel} promotion is data-blocked.`}
            </h2>
            <p className="mt-2 max-w-4xl text-xs leading-5 text-slate-400">
              SimHub is downstream of the Data Control Tower. This view uses the active sport scope unless global mode is explicitly requested, so MLB blockers do not lock MMA research cards.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {smallPill(tone(dataTower.status), `Data ${dataTower.status}`)}
            {smallPill(allowed ? "border-mint/25 bg-mint/[0.06] text-mint" : "border-crimson/25 bg-crimson/[0.06] text-crimson", allowed ? "promotion allowed" : "promotion blocked")}
            {smallPill("border-white/10 bg-white/[0.04] text-slate-300", `${scopeLabel} scope`)}
            <Link href="/accuracy/data" className="rounded-full border border-aqua/25 bg-aqua/[0.06] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-aqua transition hover:bg-aqua/[0.12]">
              Data tower
            </Link>
            <Link href="/accuracy/promotion" className="rounded-full border border-purple-300/25 bg-purple-300/[0.08] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-purple-200 transition hover:bg-purple-300/[0.14]">
              Promotion gate
            </Link>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2">
            <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-600">Tower score</div>
            <div className="mt-1 font-display text-2xl font-bold tracking-tight text-white">{dataTower.score}</div>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2">
            <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-600">Blockers</div>
            <div className={`mt-1 font-display text-2xl font-bold tracking-tight ${dataTower.blockers.length ? "text-crimson" : "text-mint"}`}>{dataTower.blockers.length}</div>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2">
            <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-600">Warnings</div>
            <div className={`mt-1 font-display text-2xl font-bold tracking-tight ${dataTower.warnings.length ? "text-amber-300" : "text-mint"}`}>{dataTower.warnings.length}</div>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2">
            <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-600">Official use</div>
            <div className={`mt-1 font-display text-2xl font-bold tracking-tight ${allowed ? "text-mint" : "text-crimson"}`}>{allowed ? "Live" : "Locked"}</div>
          </div>
        </div>

        {(topBlockers.length || topWarnings.length) ? (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-crimson/15 bg-black/20 px-3 py-2">
              <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-crimson">Top blockers</div>
              <div className="mt-2 space-y-1 text-xs leading-5 text-crimson/80">
                {topBlockers.length ? topBlockers.map((item) => <p key={item}>• {item}</p>) : <p className="text-slate-500">No hard blockers.</p>}
              </div>
            </div>
            <div className="rounded-xl border border-amber-400/15 bg-black/20 px-3 py-2">
              <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-amber-300">Top warnings</div>
              <div className="mt-2 space-y-1 text-xs leading-5 text-amber-100/75">
                {topWarnings.length ? topWarnings.map((item) => <p key={item}>• {item}</p>) : <p className="text-slate-500">No warnings.</p>}
              </div>
            </div>
          </div>
        ) : null}
      </section>
      {children}
    </div>
  );
}
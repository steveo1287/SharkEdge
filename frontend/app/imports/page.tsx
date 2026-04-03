import { ImportWorkspace } from "@/components/imports/import-workspace";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import { getImportPageData } from "@/services/imports/csv-import-service";

export const dynamic = "force-dynamic";

export default async function ImportsPage() {
  const data = await getImportPageData();

  return (
    <div className="grid gap-6">
      <Card className="overflow-hidden border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(244,114,182,0.16),_transparent_32%),linear-gradient(145deg,rgba(2,6,23,0.98),rgba(15,23,42,0.94))] p-0 shadow-[0_28px_90px_rgba(2,6,23,0.42)]">
        <div className="grid gap-5 px-6 py-6 md:px-8 lg:grid-cols-[minmax(0,1.15fr)_280px] lg:items-end">
          <div className="grid gap-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.32em] text-pink-300/80">
              Import desk
            </div>
            <h1 className="max-w-3xl font-display text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Bring outside bet history in without wrecking the ledger.
            </h1>
            <p className="max-w-2xl text-sm leading-7 text-slate-300 md:text-base">
              CSV import is meant to expand the real record, not duplicate junk or break settled bet
              history. Metadata stays attached so sync can grow later without a rewrite.
            </p>
          </div>
          <div className="grid gap-3 rounded-[28px] border border-white/10 bg-slate-950/55 p-4">
            <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Pipeline</div>
            <div className="grid gap-3 text-sm text-slate-300">
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-slate-950/70 px-4 py-3">
                <span>CSV intake</span>
                <span className="text-white">Live</span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-slate-950/70 px-4 py-3">
                <span>Deduping</span>
                <span className="text-white">On</span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-slate-950/70 px-4 py-3">
                <span>Auto-sync</span>
                <span className="text-white">Later</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <SectionTitle
        title="Import workspace"
        description="Upload, validate, and stage imported history without pretending sportsbook sync is already automatic."
      />

      <ImportWorkspace {...data} />
    </div>
  );
}

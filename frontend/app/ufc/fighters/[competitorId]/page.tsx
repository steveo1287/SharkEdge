import { notFound } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { SectionTitle } from '@/components/ui/section-title';
import { buildUfcFighterDossier } from '@/services/modeling/ufc-fighter-dossier-service';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ competitorId: string }>;
};

export default async function UfcFighterDossierPage({ params }: PageProps) {
  const { competitorId } = await params;
  try {
    const dossier = await buildUfcFighterDossier(competitorId);
    return (
      <div className="grid gap-7">
        <Card className="surface-panel-strong px-6 py-6 xl:px-8 xl:py-8">
          <div className="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-end">
            <div>
              <div className="section-kicker">UFC fighter dossier</div>
              <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-white xl:text-5xl">{dossier.competitorName}</h1>
              <div className="mt-3 flex flex-wrap gap-2">
                {dossier.sourceSummary.supportingSources.map((source) => (
                  <Badge key={source} tone="muted">{source}</Badge>
                ))}
              </div>
            </div>
            <div className="grid gap-2 rounded-[1.6rem] border border-white/10 bg-slate-950/65 p-4 text-right">
              <div className="text-[0.68rem] uppercase tracking-[0.24em] text-slate-500">Source confidence</div>
              <div className="text-2xl font-semibold text-white">{dossier.sourceSummary.sourceConfidenceScore.toFixed(1)}</div>
            </div>
          </div>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <Card className="grid gap-4 p-5">
            <SectionTitle eyebrow="Identity" title="Profile core" description="Normalized identity, camp, and stance." />
            <div className="grid gap-2 text-sm text-slate-300">
              <div><span className="text-slate-500">Nickname:</span> {dossier.identity.nickname ?? '—'}</div>
              <div><span className="text-slate-500">Camp:</span> {dossier.identity.camp ?? '—'}</div>
              <div><span className="text-slate-500">Stance:</span> {dossier.identity.stance ?? '—'}</div>
              <div><span className="text-slate-500">Age:</span> {dossier.identity.age ?? '—'}</div>
              <div><span className="text-slate-500">Reach:</span> {dossier.identity.reachInches ?? '—'}</div>
            </div>
          </Card>

          <Card className="grid gap-4 p-5">
            <SectionTitle eyebrow="Scouting" title="Best wins and bad losses" description="Opponent-quality summary from the UFC dossier service." />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Best wins</div>
                {dossier.scouting.bestWins.map((win, index) => (
                  <div key={`${win.opponentCompetitorId ?? index}-win`} className="rounded-2xl border border-white/8 bg-slate-950/60 px-3 py-3 text-sm text-slate-300">
                    Opponent record {win.opponentRecord ?? '—'} · {win.method ?? 'Result unknown'}
                  </div>
                ))}
              </div>
              <div className="grid gap-2">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Bad losses</div>
                {dossier.scouting.badLosses.map((loss, index) => (
                  <div key={`${loss.opponentCompetitorId ?? index}-loss`} className="rounded-2xl border border-white/8 bg-slate-950/60 px-3 py-3 text-sm text-slate-300">
                    Opponent record {loss.opponentRecord ?? '—'} · {loss.method ?? 'Result unknown'}
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  } catch {
    notFound();
  }
}

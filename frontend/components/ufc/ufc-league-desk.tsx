import Link from 'next/link';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SectionTitle } from '@/components/ui/section-title';
import { UfcRankBadge } from '@/components/ufc/ufc-rank-badge';
import { getUfcLeagueHubData } from '@/services/modeling/ufc-hub-service';

export async function UfcLeagueDesk() {
  const data = await getUfcLeagueHubData();

  return (
    <div className="grid gap-7">
      <Card className="surface-panel-strong px-6 py-6 xl:px-8 xl:py-8">
        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr] xl:items-end">
          <div className="grid gap-3">
            <div className="section-kicker">UFC command center</div>
            <h1 className="font-display text-4xl font-semibold tracking-tight text-white xl:text-5xl">
              Rankings, champions, divisions, event context, and fighter dossiers in one desk.
            </h1>
            <p className="max-w-3xl text-base leading-8 text-slate-300">
              This hub is division-first and card-aware. Champions and ranked contenders stay normalized.
              Event cards pull title-fight and ranked-fight context from the same UFC metadata layer the model uses.
            </p>
          </div>
          <div className="grid gap-3 rounded-[1.6rem] border border-white/10 bg-slate-950/65 p-4 md:grid-cols-2">
            <div>
              <div className="text-[0.68rem] uppercase tracking-[0.24em] text-slate-500">Tracked divisions</div>
              <div className="mt-2 text-2xl font-semibold text-white">{data.divisions.length}</div>
            </div>
            <div>
              <div className="text-[0.68rem] uppercase tracking-[0.24em] text-slate-500">Upcoming events</div>
              <div className="mt-2 text-2xl font-semibold text-white">{data.upcomingEvents.length}</div>
            </div>
          </div>
        </div>
      </Card>

      <section className="grid gap-4">
        <SectionTitle
          eyebrow="Division board"
          title="Champions and ranked contenders"
          description="Every division uses one canonical UFC division key so rank, champion state, and dossier links stay clean."
        />
        <div className="grid gap-4 xl:grid-cols-2">
          {data.divisions.map((division) => (
            <Card key={division.key} className="grid gap-4 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-500">{division.key}</div>
                  <div className="mt-1 text-lg font-semibold text-white">{division.label}</div>
                </div>
                {division.champion ? <Badge tone="premium">Champion set</Badge> : <Badge tone="muted">Vacant / missing</Badge>}
              </div>

              {division.champion ? (
                <div className="rounded-2xl border border-amber-300/20 bg-amber-400/5 p-4">
                  <div className="mb-2 text-[0.68rem] uppercase tracking-[0.22em] text-amber-200/80">Champion</div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-base font-semibold text-white">{division.champion.name}</div>
                    <UfcRankBadge championStatus={division.champion.championStatus} ranking={division.champion.ranking} />
                  </div>
                  <div className="mt-3">
                    <Link href={`/ufc/fighters/${division.champion.id}`} className="text-sm font-medium text-sky-300 hover:text-sky-200">
                      Open dossier
                    </Link>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-2">
                {division.contenders.map((fighter) => (
                  <div key={fighter.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-slate-950/60 px-3 py-3">
                    <div>
                      <div className="text-sm font-medium text-white">{fighter.name}</div>
                      <div className="text-xs text-slate-400">{fighter.dossierReady ? 'Dossier ready' : 'Dossier pending'}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <UfcRankBadge championStatus={fighter.championStatus} ranking={fighter.ranking} />
                      <Link href={`/ufc/fighters/${fighter.id}`} className="text-xs font-medium uppercase tracking-[0.18em] text-sky-300 hover:text-sky-200">
                        Dossier
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="grid gap-4">
        <SectionTitle
          eyebrow="Event board"
          title="Upcoming UFC events"
          description="Title fights, ranked fights, division context, and dossier routing all come from the normalized UFC event context service."
        />
        <div className="grid gap-4 xl:grid-cols-2">
          {data.upcomingEvents.map((event) => (
            <Card key={event.id} className="grid gap-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-500">{event.context.divisionLabel ?? 'Division pending'}</div>
                  <div className="mt-1 text-lg font-semibold text-white">{event.name}</div>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  {event.context.titleFight ? <Badge tone="premium">Title fight</Badge> : null}
                  {event.context.rankedFight ? <Badge tone="brand">Ranked</Badge> : <Badge tone="muted">Unranked</Badge>}
                </div>
              </div>

              <div className="grid gap-2">
                {event.context.fighters.map((fighter) => (
                  <div key={fighter.competitorId} className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-slate-950/60 px-3 py-3">
                    <div>
                      <div className="text-sm font-medium text-white">{fighter.name}</div>
                      <div className="text-xs text-slate-400">{fighter.dossierReady ? 'Dossier ready' : 'Dossier pending'}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <UfcRankBadge championStatus={fighter.championStatus} ranking={fighter.ranking} />
                      <Link href={`/ufc/fighters/${fighter.competitorId}`} className="text-xs font-medium uppercase tracking-[0.18em] text-sky-300 hover:text-sky-200">
                        Dossier
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

import Link from "next/link";

type Props = {
  selectedLeague: string;
  selectedDate: string;
  leagues: readonly string[];
  dates: readonly string[];
};

function getHref(league: string, date: string) {
  return `/board?league=${league}&date=${date}`;
}

export function BoardHero({
  selectedLeague,
  selectedDate,
  leagues,
  dates
}: Props) {
  return (
    <section className="surface-panel-strong overflow-hidden px-6 py-6 xl:px-8 xl:py-8">
      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="grid gap-5">
          <div className="section-kicker">Board command</div>

          <div className="max-w-5xl font-display text-4xl font-semibold tracking-tight text-white xl:text-6xl">
            Open the slate by signal, not by noise.
          </div>

          <div className="max-w-3xl text-base leading-8 text-slate-300">
            Verified books, real movement, and direct paths into the matchup hub.
            Thin markets stay visible as context, not fake conviction.
          </div>

          <div className="flex flex-wrap gap-2">
            {leagues.map((league) => (
              <Link
                key={league}
                href={getHref(league, selectedDate)}
                className={
                  selectedLeague === league
                    ? "rounded-full border border-sky-400/35 bg-sky-500/12 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-white"
                    : "rounded-full border border-white/8 bg-white/[0.02] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400 transition hover:border-white/12 hover:text-white"
                }
              >
                {league}
              </Link>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {dates.map((date) => (
              <Link
                key={date}
                href={getHref(selectedLeague, date)}
                className={
                  selectedDate === date
                    ? "rounded-full border border-sky-400/35 bg-sky-500/12 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-white"
                    : "rounded-full border border-white/8 bg-white/[0.02] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400 transition hover:border-white/12 hover:text-white"
                }
              >
                {date}
              </Link>
            ))}
          </div>
        </div>

        <div className="grid gap-4 rounded-[1.6rem] border border-white/8 bg-[#09131f]/85 p-5">
          <div className="text-[0.66rem] uppercase tracking-[0.24em] text-slate-500">
            Desk posture
          </div>

          <div className="text-2xl font-semibold text-white">
            Start with verified rows. Use movers to prioritize. Use league desks to widen.
          </div>

          <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-4 text-sm leading-6 text-slate-300">
            This board is now structured as a command surface: verified board, movers,
            league desks, and scoreboard context.
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-[1.1rem] border border-white/8 bg-slate-950/60 p-4">
              <div className="text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">
                First move
              </div>
              <div className="mt-2 text-base font-semibold text-white">
                Open the strongest verified matchup
              </div>
            </div>

            <div className="rounded-[1.1rem] border border-white/8 bg-slate-950/60 p-4">
              <div className="text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">
                Secondary move
              </div>
              <div className="mt-2 text-base font-semibold text-white">
                Check where the number actually moved
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
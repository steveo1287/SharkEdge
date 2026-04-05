import Link from "next/link";

type Props = {
  selectedLeague: string;
  selectedDate: string;
  leagues: readonly string[];
  dates: readonly string[];
};

export function BoardHero({
  selectedLeague,
  selectedDate,
  leagues,
  dates
}: Props) {
  const getHref = (league: string, date: string) =>
    `/board?league=${league}&date=${date}`;

  return (
    <section className="surface-panel-strong px-6 py-6 xl:px-8 xl:py-8">
      <div className="grid gap-6">
        <div className="section-kicker">Board command</div>

        <div className="font-display text-4xl font-semibold text-white xl:text-6xl">
          Open the slate by signal, not by noise.
        </div>

        <div className="text-slate-300 max-w-3xl">
          Verified books, real movement, clean routing into matchups.
        </div>

        {/* League filter */}
        <div className="flex flex-wrap gap-2">
          {leagues.map((league) => (
            <Link
              key={league}
              href={getHref(league, selectedDate)}
              className={
                selectedLeague === league
                  ? "pill-active"
                  : "pill-default"
              }
            >
              {league}
            </Link>
          ))}
        </div>

        {/* Date filter */}
        <div className="flex flex-wrap gap-2">
          {dates.map((date) => (
            <Link
              key={date}
              href={getHref(selectedLeague, date)}
              className={
                selectedDate === date
                  ? "pill-active"
                  : "pill-default"
              }
            >
              {date}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
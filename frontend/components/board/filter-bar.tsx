import type { LeagueRecord, SportsbookRecord } from "@/lib/types/domain";

import { Card } from "@/components/ui/card";

type BoardFilterBarProps = {
  leagues: LeagueRecord[];
  sportsbooks: SportsbookRecord[];
  dates: string[];
  defaults: {
    league: string;
    date: string;
    sportsbook: string;
    market: string;
    status: string;
  };
};

export function BoardFilterBar({
  leagues,
  sportsbooks,
  dates,
  defaults
}: BoardFilterBarProps) {
  return (
    <Card className="p-4">
      <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <select
          name="league"
          defaultValue={defaults.league}
          className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
        >
          <option value="ALL">All leagues</option>
          {leagues.map((league) => (
            <option key={league.id} value={league.key}>
              {league.key}
            </option>
          ))}
        </select>

        <select
          name="date"
          defaultValue={defaults.date}
          className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
        >
          <option value="all">All dates</option>
          {dates.map((date) => (
            <option key={date} value={date}>
              {date}
            </option>
          ))}
        </select>

        <select
          name="sportsbook"
          defaultValue={defaults.sportsbook}
          className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
        >
          {sportsbooks.map((book) => (
            <option key={book.id} value={book.key}>
              {book.name}
            </option>
          ))}
        </select>

        <select
          name="market"
          defaultValue={defaults.market}
          className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
        >
          <option value="all">All markets</option>
          <option value="spread">Spread focus</option>
          <option value="moneyline">Moneyline focus</option>
          <option value="total">Total focus</option>
        </select>

        <div className="grid grid-cols-[1fr_auto] gap-3">
          <select
            name="status"
            defaultValue={defaults.status}
            className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
          >
            <option value="pregame">Pregame</option>
            <option value="live">Live preview</option>
          </select>
          <button
            type="submit"
            className="rounded-2xl border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-sm font-medium text-sky-300"
          >
            Apply
          </button>
        </div>
      </form>
    </Card>
  );
}

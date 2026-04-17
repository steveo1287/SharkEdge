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

const selectClass =
  "input-mono appearance-none rounded-md border border-bone/[0.10] bg-surface px-3 py-2 text-[13px] font-medium text-text-primary transition-colors focus:border-aqua focus:outline-none";

export function BoardFilterBar({
  leagues,
  sportsbooks,
  dates,
  defaults
}: BoardFilterBarProps) {
  return (
    <Card className="p-4">
      <form className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
        <select name="league" defaultValue={defaults.league} className={selectClass}>
          <option value="ALL">All target sports</option>
          {leagues.map((league) => (
            <option key={league.id} value={league.key}>{league.name}</option>
          ))}
        </select>

        <select name="date" defaultValue={defaults.date} className={selectClass}>
          <option value="all">All dates</option>
          {dates.map((date) => (
            <option key={date} value={date}>{date}</option>
          ))}
        </select>

        <select name="sportsbook" defaultValue={defaults.sportsbook} className={selectClass}>
          {sportsbooks.map((book) => (
            <option key={book.id} value={book.key}>{book.name}</option>
          ))}
        </select>

        <select name="market" defaultValue={defaults.market} className={selectClass}>
          <option value="all">All markets</option>
          <option value="spread">Spread focus</option>
          <option value="moneyline">Moneyline focus</option>
          <option value="total">Total focus</option>
        </select>

        <div className="grid grid-cols-[1fr_auto] gap-2">
          <select name="status" defaultValue={defaults.status} className={selectClass}>
            <option value="pregame">Pregame</option>
            <option value="live">Live state</option>
          </select>
          <button type="submit" className="btn-primary">
            Apply
          </button>
        </div>
      </form>
      <div className="mt-3 text-[12px] leading-[1.55] text-bone/55">
        Every target sport stays visible on the board. LIVE sports render real score/state adapters, PARTIAL sports stay visible with limited-coverage notes, and COMING SOON sports never fake empty board depth.
      </div>
    </Card>
  );
}

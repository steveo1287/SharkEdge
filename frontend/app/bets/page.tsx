import { BetsWorkspace } from "@/components/bets/bets-workspace";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import { getBetTrackerData, parseBetFilters } from "@/services/bets/bets-service";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BetsPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const filters = parseBetFilters(resolved);
  const selection = Array.isArray(resolved.selection) ? resolved.selection[0] : resolved.selection;
  const data = await getBetTrackerData(filters, selection);

  return (
    <div className="grid gap-6">
      <SectionTitle
        title="Bet Ledger"
        description="Real persistence, straight and parlay support, live sweat context, and the analytics backbone SharkEdge needs before sportsbook sync lands."
      />

      <Card className="p-4">
        <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-8">
          <select name="status" defaultValue={filters.status} className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white">
            <option value="ALL">All bets</option>
            <option value="OPEN">Open</option>
            <option value="SETTLED">Settled</option>
            <option value="WIN">Wins</option>
            <option value="LOSS">Losses</option>
            <option value="PUSH">Pushes</option>
            <option value="VOID">Void</option>
            <option value="CASHED_OUT">Cashed Out</option>
          </select>

          <select name="sport" defaultValue={filters.sport} className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white">
            <option value="ALL">All sports</option>
            {data.sports.map((sport) => (
              <option key={sport.code} value={sport.code}>
                {sport.label}
              </option>
            ))}
          </select>

          <select name="league" defaultValue={filters.league} className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white">
            <option value="ALL">All leagues</option>
            {data.leagues.map((league) => (
              <option key={league.key} value={league.key}>
                {league.label}
              </option>
            ))}
          </select>

          <select name="market" defaultValue={filters.market} className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white">
            <option value="ALL">All markets</option>
            {data.marketOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select name="sportsbook" defaultValue={filters.sportsbook} className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white">
            <option value="all">All books</option>
            {data.sportsbooks.map((book) => (
              <option key={book.id} value={book.key}>
                {book.name}
              </option>
            ))}
          </select>

          <select name="window" defaultValue={filters.window} className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white">
            <option value="all">All time</option>
            <option value="today">Today</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>

          <select name="sort" defaultValue={filters.sort} className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white">
            <option value="placedAt">Placed Time</option>
            <option value="stake">Stake</option>
            <option value="result">Result</option>
            <option value="clv">CLV</option>
          </select>

          <div className="grid grid-cols-[1fr_auto] gap-3">
            <select name="direction" defaultValue={filters.direction} className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white">
              <option value="desc">Desc</option>
              <option value="asc">Asc</option>
            </select>
            <button type="submit" className="rounded-2xl border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-sm font-medium text-sky-300">
              Apply
            </button>
          </div>
        </form>
      </Card>

      <BetsWorkspace
        summary={data.summary}
        bets={data.bets}
        openBets={data.openBets}
        settledBets={data.settledBets}
        sweatBoard={data.sweatBoard}
        sportsbooks={data.sportsbooks}
        events={data.events}
        marketOptions={data.marketOptions}
        setup={data.setup}
        prefill={data.prefill}
        liveNotes={data.liveNotes}
      />
    </div>
  );
}

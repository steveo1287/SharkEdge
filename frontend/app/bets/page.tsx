import { BetsWorkspace } from "@/components/bets/bets-workspace";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import { getBetPrefill, getBetTrackerData, parseBetFilters } from "@/services/bets/bets-service";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BetsPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const filters = parseBetFilters(resolved);
  const selection = Array.isArray(resolved.selection) ? resolved.selection[0] : resolved.selection;
  const prefill = getBetPrefill(selection);
  const data = getBetTrackerData(filters);

  return (
    <div className="grid gap-6">
      <SectionTitle
        title="Bet Tracker"
        description="Manual now, built to grow into linked sportsbook history, CLV, and bankroll workflows."
      />

      <Card className="p-4">
        <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <select name="state" defaultValue={filters.state} className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white">
            <option value="ALL">All bets</option>
            <option value="OPEN">Open</option>
            <option value="SETTLED">Settled</option>
          </select>
          <select name="sport" defaultValue={filters.sport} className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white">
            <option value="ALL">All sports</option>
            <option value="BASKETBALL">Basketball</option>
          </select>
          <select name="market" defaultValue={filters.market} className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white">
            <option value="ALL">All markets</option>
            <option value="spread">Spread</option>
            <option value="moneyline">Moneyline</option>
            <option value="total">Total</option>
            <option value="player_points">Player Points</option>
            <option value="player_rebounds">Player Rebounds</option>
            <option value="player_assists">Player Assists</option>
            <option value="player_threes">Player Threes</option>
          </select>
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <select name="sportsbook" defaultValue={filters.sportsbook} className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white">
              <option value="all">All books</option>
              {data.sportsbooks.map((book) => (
                <option key={book.id} value={book.key}>
                  {book.name}
                </option>
              ))}
            </select>
            <button type="submit" className="rounded-2xl border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-sm font-medium text-sky-300">
              Apply
            </button>
          </div>
        </form>
      </Card>

      <BetsWorkspace initialBets={data.bets} sportsbooks={data.sportsbooks} prefill={prefill} />
    </div>
  );
}

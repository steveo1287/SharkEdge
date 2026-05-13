export function SharkTrendsMatchesTable({ matches }: { matches: any[] }) {
  if (!matches?.length) return null;
  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-5">
      <h2 className="text-xl font-semibold text-white">Exact matching games</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.18em] text-slate-500">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Team</th>
              <th className="px-3 py-2">Opponent</th>
              <th className="px-3 py-2">Market</th>
              <th className="px-3 py-2">Odds</th>
              <th className="px-3 py-2">Close</th>
              <th className="px-3 py-2">Result</th>
              <th className="px-3 py-2">Score</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Q</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-slate-300">
            {matches.map((row, index) => (
              <tr key={`${row.eventId}-${index}`}>
                <td className="px-3 py-2">{row.date ? new Date(row.date).toLocaleDateString() : "--"}</td>
                <td className="px-3 py-2 text-white">{row.team}</td>
                <td className="px-3 py-2">{row.opponent}</td>
                <td className="px-3 py-2">{row.marketType} {row.side}</td>
                <td className="px-3 py-2">{row.oddsAmerican ?? "--"}</td>
                <td className="px-3 py-2">{row.closingOddsAmerican ?? row.closingLine ?? "--"}</td>
                <td className="px-3 py-2">{row.result}</td>
                <td className="px-3 py-2">{row.teamScore ?? "--"}-{row.opponentScore ?? "--"}</td>
                <td className="px-3 py-2">{row.sourceKey}</td>
                <td className="px-3 py-2">{row.dataQualityScore}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// (only showing modified section for clarity)

        (() => {
          const sim = simEdgeMap.get(prop.id);
          if (!sim) return <div>Sim unavailable</div>;
          const positive = sim.displayEdge > 0;
          const conf = sim.projection.confidence;
          const bet = sim.projection.betSizing;
          return (
            <div key={`${prop.id}-sim-edge`} className="min-w-[140px]">
              <div className={positive ? "font-mono text-sm font-semibold text-emerald-300" : "font-mono text-sm font-semibold text-rose-300"}>
                {sim.displayEdge > 0 ? "+" : ""}{sim.displayEdge.toFixed(1)}%
              </div>
              <div className="text-xs text-slate-500">
                {sim.label} | conf {(conf * 100).toFixed(0)}%
              </div>
              <div className="text-xs text-slate-500">
                Sim {((sim.sideProbability ?? 0) * 100).toFixed(1)}% | fair {formatAmericanOdds(sim.projection.fairOdds)}
              </div>
              {bet?.stakePct ? (
                <div className="mt-1 text-xs text-emerald-300">
                  Bet {(bet.stakePct * 100).toFixed(1)}%
                </div>
              ) : null}
              <Link href={sim.href} className="mt-1 inline-flex rounded-md border border-sky-400/25 bg-sky-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.10em] text-sky-300 hover:bg-sky-500/15">
                Sim Edge
              </Link>
            </div>
          );
        })(),
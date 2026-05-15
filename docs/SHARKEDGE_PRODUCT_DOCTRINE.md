# SharkEdge Product Doctrine

## Current product strategy

SharkEdge is now a simulator-first product.

The active flagship lanes are:

1. **MLB Sim Lab**
2. **MMA / UFC Fight Lab**

Everything else is secondary, parked, or support infrastructure.

## What is parked

The TrendsCenter-style product is intentionally in cold storage until SharkEdge can afford or acquire premium historical data.

Parked areas include:

- large-scale trend mining
- automatic TrendsCenter cache warmups
- expensive historical warehouse rebuilds
- premium-looking trend claims without premium-grade data
- trend-first homepage positioning
- NBA trend/sim expansion unless the active sports calendar or product strategy changes

The app may preserve old routes for compatibility, but those routes should not drive product focus, database load, homepage queries, or user-facing priority.

## Product rule

Do not make SharkEdge look smarter than its data.

A+ product behavior means:

- show when data is missing
- show when odds are missing
- show when model output is stale
- show when a line is not actionable
- show when a card is only a pipeline/debug surface
- allow PASS/no-bet outcomes
- avoid unsupported trend records
- avoid fake confidence
- avoid broad pages that do not create decisions

## Active lane 1: MLB Sim Lab

MLB should become an A+ decision cockpit, not a crowded scoreboard.

The MLB surface should prioritize:

- game-level simulation output
- projected score
- moneyline probability
- total projection
- market total comparison
- market line freshness
- market match rate
- data source quality
- fallback/synthetic-row detection
- pitcher and bullpen context
- no-bet gates
- total sanity checks
- factor stack explanations
- settled-result accuracy tracking

### MLB readiness states

Every MLB slate should eventually resolve to one of these states:

- **Decision-ready slate**: fresh sim cache, fresh odds, high market match rate, no major input warnings.
- **Partial-trust slate**: usable projections exist, but some markets, features, or freshness checks are weak.
- **Pipeline-only slate**: not enough fresh data to make decisions.

### MLB product principle

The best MLB card is not the one with the most numbers. It is the one that clearly answers:

1. What is the model projecting?
2. What does the market say?
3. Where is the edge?
4. What could make this wrong?
5. Is this a bet, lean, watch, or pass?

## Active lane 2: MMA / UFC Fight Lab

MMA should become a deep fight-decision product.

The MMA surface should prioritize:

- upcoming card ingestion
- fighter feature hydration
- source audit
- fight-path modeling
- method probabilities
- round distribution
- style matchup explanation
- danger flags
- card decision readiness
- fight decision readiness
- calibration from shadow results

### MMA readiness states

Every MMA/UFC surface should clearly show:

- **Actionable lab**: enough source, feature, and sim coverage to review decisions.
- **Partial trust**: some usable model output exists, but coverage or source quality is incomplete.
- **Not ready**: show as pipeline/debug only, not as a decision product.

Every card should show:

- **Decision-ready card**
- **Partial-trust card**
- **Pipeline-only card**

Every fight should show:

- **Fight is decision-ready**
- **Fight is watchlist-only**
- **Fight is not ready**

## SimHub role

SimHub is the command center, not a dumping ground.

It should route users into the two flagship lanes:

- `/baseball` for MLB Sim Lab
- `/sim/ufc` for MMA / UFC Fight Lab

SimHub can show cached MLB board output, but it should not pretend to be every product at once. It should make the strategy clear:

> Two flagship products. No trend bloat.

## Navigation rules

Primary navigation should point to:

- `/`
- `/sim`
- `/baseball`
- `/sim/ufc`
- `/accuracy`
- `/saved`

Legacy routes may redirect, but new work should not build new product surfaces under old SharkFights or TrendsCenter paths.

Avoid new primary links to:

- `/sharkfights`
- `/sharkfights/ufc`
- `/sharktrends` except as parked research
- `/sim-fast` as a public-facing route
- unused NBA pages unless NBA is intentionally reactivated

## Cost-control rules

The free/low-cost route means:

- prefer cached reads over request-time rebuilds
- keep expensive workers opt-in
- avoid background trend refreshes
- do not mount heavy data providers globally
- do not query large historical stores from layout or homepage requests
- make provider health visible
- expose stale data rather than hiding it

## A+ interface rules

A+ SharkEdge screens should have:

- a clear decision state
- trust/readiness labels
- data freshness labels
- market context
- what-could-kill-it warnings
- source quality labels
- direct next action
- honest empty states

A+ screens should not be:

- generic dashboards
- spreadsheet dumps
- unfiltered lists
- fake betting signals
- trend walls without historical proof
- pages that exist only because the route exists

## Agent instructions

When Codex, Claude, GitHub agent, or ChatGPT modifies SharkEdge, default to this order:

1. Protect current deployability.
2. Keep Vercel green.
3. Improve MLB Sim Lab or MMA/UFC Fight Lab.
4. Add readiness/trust gates before adding more picks.
5. Remove or redirect stale routes.
6. Keep Trends parked unless explicitly reactivated.
7. Prefer small, deployable commits.
8. Do not introduce expensive background jobs without an opt-in env flag.
9. Do not add unsupported betting claims.
10. Document anything that changes product direction.

## Immediate roadmap

Highest-value next build items:

1. Add an MLB Readiness Gate matching the MMA trust gate.
2. Make `/sim` visually focus only on MLB and MMA/UFC.
3. Add MMA wording beside UFC wording where appropriate.
4. Add settled-result accuracy panels for MLB and MMA.
5. Add stronger no-bet and danger-flag explanations.
6. Add provider health and cache freshness at the top of each flagship page.
7. Reduce or redirect stale pages that do not serve MLB or MMA.

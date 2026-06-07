# MLB elite do-not-bet rules

Do not emit a strong MLB betting recommendation when:

- starting pitcher is missing or mismatched
- fewer than 9 hitters match the projected lineup
- either lineup is unconfirmed in the final pregame window
- elite rating snapshot is stale
- `gameInputs.dataQuality < 60`
- NRFI/F5 calibration ledger is empty or too thin
- bullpen availability is unknown for a game where late innings matter
- weather/park context is missing for totals or HR-sensitive plays

This is especially important for NRFI/F5 because one bad starter, wrong lineup, or stale bullpen state can flip the edge.

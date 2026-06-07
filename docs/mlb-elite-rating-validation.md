# MLB elite rating validation checklist

Before using this in production:

```bash
npx tsx tests/mlb-elite-rating-system.test.ts
npx tsx tests/mlb-real-player-ratings.test.ts
npm run test:mlb-v8-production
npm run typecheck
```

Expected success path:

- Elite player ratings are generated.
- Team ratings are generated.
- Derived game inputs are generated.
- Player projection engine accepts elite team contexts.
- Inning engine accepts elite offense/starter/bullpen scores.
- NRFI/F5 outputs remain bounded and explainable.

Known remaining work:

- The new focused test is not yet added to the main `npm test` chain.
- The snapshot worker is a scaffold that expects JSON feeds.
- The live board still needs to be wired to consume the generated snapshot.

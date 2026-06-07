# MLB elite rating final notes

The elite layer is intentionally separate from the existing projection engine. This keeps the sim stable while replacing weak upstream player inputs.

Expected flow:

1. Build/fetch raw player stats.
2. Build/fetch tendency overlays.
3. Build/fetch team context.
4. Build/fetch market calibration rows.
5. Generate elite snapshot.
6. Use elite team ratings to feed player props, NRFI/YRFI, F5, and full-game models.
7. Pass when the data is not strong enough.

This avoids the old failure mode where the product created confidence from synthetic assumptions instead of real player information.

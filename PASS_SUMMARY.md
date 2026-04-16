SharkEdge Probability Fusion Pass

Implemented against the uploaded repo snapshot.

Core upgrades:
- Added trend posterior shrinkage layer under `frontend/services/trends/posterior/trend-posterior.ts`
- Updated active trend signals to use posterior probability / uncertainty instead of raw hit-rate edge only
- Added market calibration utility under `frontend/services/modeling/probability-calibration.ts`
- Upgraded MLB simulation output with calibrated win probability metadata and uncertainty scoring
- Added opportunity probability fusion layer under `frontend/services/opportunities/opportunity-probability-fusion.ts`
- Integrated probability fusion into `opportunity-service.ts`
- Updated opportunity scoring to account for posterior edge and uncertainty penalty
- Added probability fusion types to `frontend/lib/types/opportunity.ts`
- Added new tests for trend posterior and probability fusion

Limits of this pass:
- This does not wire a live weather feed into MLB sim; it adds the calibration hook and uncertainty haircut instead
- This does not replace the full non-MLB generic model engine yet
- This does not add a new database persistence layer for posterior snapshots
- This was done without installing repo dependencies in the container, so full runtime verification still needs local/project install

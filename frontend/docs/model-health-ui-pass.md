# Model health UI pass

## Added
- live model health panel component
- notification delivery rules for critical calibration alerts
- notification delivery API

## Product effects
- UI can surface active calibration health and alerts
- degraded factor buckets can be tagged in edge cards/feed rows
- non-qualified winner picks can be de-emphasized in the board
- critical alerts can be routed into an in-app delivery record

## Next UI integration
- mount `ModelHealthPanel` on home/dashboard or board route
- style winner-qualified and downgraded picks distinctly
- add a user toggle for 'High conviction winner picks only'

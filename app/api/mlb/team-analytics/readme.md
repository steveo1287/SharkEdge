# SharkEdge MLB Team Analytics Feed

Set `MLB_TEAM_ANALYTICS_URL` to this route after deploy:

```text
https://<your-domain>/api/mlb/team-analytics
```

Optional upstream raw feed env vars:

```text
MLB_RAW_TEAM_STATS_URL=https://your-worker-or-json-feed/teams
MLB_STATS_PIPELINE_URL=https://your-worker-or-json-feed/teams
```

Expected upstream rows may include any of these fields. Missing values are derived or defaulted:

```json
{
  "teamName": "Chicago Cubs",
  "runsScored": 720,
  "runsAllowed": 680,
  "games": 162,
  "ops": 0.735,
  "obp": 0.322,
  "slg": 0.413,
  "era": 4.05,
  "whip": 1.26,
  "wrcPlus": 104,
  "xwoba": 0.326,
  "isoPower": 0.171,
  "kRate": 22.8,
  "bbRate": 8.7,
  "babip": 0.296,
  "baseRunning": 2.4,
  "starterEraMinus": 94,
  "starterXFip": 3.91,
  "bullpenEraMinus": 101,
  "bullpenXFip": 4.12,
  "bullpenFatigue": 0.35,
  "defensiveRunsSaved": 8,
  "parkRunFactor": 1.03,
  "weatherRunFactor": 1.04,
  "recentForm": 1.8,
  "travelRest": 0.2
}
```

Debug with:

```text
/api/debug/mlb-feed?away=Chicago Cubs&home=St. Louis Cardinals
```

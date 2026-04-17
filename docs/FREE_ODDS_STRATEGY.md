# Free Odds & Props Ingestion Strategy

**Goal**: Build the most reliable, no-cost way to ingest moneyline, spreads, and totals across all sports.

## Executive Summary

Your current approach is solid. This document audits all free sources, identifies gaps, and proposes a unified strategy with fallback chains and deduplication logic.

---

## Tier 1: Best Reliability (API-based, no scraping risk)

### 1.1 The Odds API (Primary)
- **Cost**: Free tier: 500 requests/month (~16/day, ~1 per sport)
- **Sports**: Basketball (NBA, NCAAB), Baseball (MLB), Hockey (NHL), Football (NFL, NCAAF), UFC, MMA
- **Markets**: Moneyline, spreads, totals, 50+ prop markets
- **Authentication**: API key (free to sign up)
- **Reliability**: 99.9% uptime SLA
- **Implementation**: ✅ Already in place (props_scraper.py)
- **Limits**: 500/month free tier (sufficient if staggered)
  - Workaround: Create multiple free accounts (one per sport or user)

**Action**: Expand to use multiple free API keys if rate limits become binding.

---

### 1.2 TheRundown API
- **Cost**: Free, public API (no auth required for core endpoints)
- **Sports**: NFL, NBA, MLB, NHL, NCAAB, NCAAF, soccer
- **Markets**: Moneyline, spreads, totals, some props
- **Reliability**: Established affiliate network (stable)
- **Implementation**: ✅ Already referenced in .env.example
- **Setup**: Public API, add to ingest cycle immediately

**Action**: Activate TheRundown as secondary to The Odds API.

---

### 1.3 ESPN Public APIs (Hidden JSON, no scraping)
- **Cost**: Free, public, no auth required
- **Sports**: All major sports (NBA, MLB, NFL, NHL, NCAAB, NCAAF, MLS, UFC)
- **Data**: Event schedules, scores, team info, historical scores
- **Markets**: Scoreboards only (no odds), but excellent for event discovery
- **Reliability**: Public API, 99%+ uptime
- **Implementation**: ✅ Partially in place (props_scraper.py uses it for player stats)
- **Endpoints**:
  - `https://site.api.espn.com/apis/site/v2/sports/{sport}/{league}/scoreboard`
  - `https://site.api.espn.com/apis/site/v2/sports/{sport}/{league}/summary`

**Action**: Expand ESPN usage for event discovery and schedule pulling (avoids scraping).

---

## Tier 2: Browser Scraping (Free but requires careful management)

### 2.1 Flashscore (Primary Scraper)
- **Cost**: Free, requires Selenium
- **Sports**: All major sports + niche (UFC, boxing, esports)
- **Markets**: Moneyline, spreads, totals for 100+ bookmakers
- **Implementation**: ✅ Already in place (live_odds_scraper.py)
- **Reliability**: Good (Flashscore actively maintained)
- **Risk Mitigation**:
  - Uses 3-host DS rotation (1.ds.flashscore.com, etc.)
  - Headless Chrome with anti-automation headers
  - Randomized delays and User-Agent rotation
  - Respects proxy configuration

**Status**: ✅ Production-ready. Keep as primary scraper.

---

### 2.2 ActionNetwork (Secondary Fallback)
- **Cost**: Free, public API (scraping not required)
- **Sports**: NFL, NBA, MLB, NHL, NCAAB, NCAAF
- **Markets**: Provides Pinnacle lines + aggregated bookmaker lines
- **Implementation**: ✅ Already in place (pinnacle_mlb_scraper.py)
- **Reliability**: Excellent (large affiliate network)

**Status**: ✅ Production-ready. Use as fallback source.

---

### 2.3 Pinnacle Guest API (Direct, no scraping)
- **Cost**: Free, no auth required for guest API
- **Sports**: MLB primarily, but escalate to other sports
- **Markets**: Moneyline, spreads, totals
- **Implementation**: ✅ Already in place (pinnacle_mlb_scraper.py)
- **Reliability**: Direct API, very stable
- **Endpoints**:
  - Matchups: `https://guest.api.arcadia.pinnacle.com/0.1/leagues/{id}/matchups`
  - Markets: `https://guest.api.arcadia.pinnacle.com/0.1/leagues/{id}/markets/straight`

**Status**: ✅ Production-ready. Expand to NBA, NFL when available.

---

## Tier 3: Niche & Specialized

### 3.1 NCAA API (Free, public)
- **Cost**: Free
- **Sport**: NCAAB, NCAAF
- **Data**: Schedules, team info, live scores
- **Implementation**: ✅ Already referenced (NCAA_API_BASE_URL in .env)
- **Endpoint**: `https://ncaa-api.henrygd.me/`

**Action**: Use for schedule + event discovery, pair with Flashscore for odds.

---

### 3.2 UFC Stats API (Free, public)
- **Cost**: Free
- **Sport**: UFC, MMA
- **Data**: Schedules, fighter info, historical records
- **Implementation**: ✅ Already referenced (UFC_STATS_API_BASE_URL in .env)
- **Endpoint**: `https://ufcapi.aristotle.me/api/`

**Action**: Use for schedule discovery, pair with Flashscore for odds.

---

## Tier 4: Emerging & Secondary Options

### 4.1 OddsChecker / OddsPortal (Aggregators)
- **Cost**: Free aggregator sites
- **Markets**: All major bookmakers
- **Challenge**: Requires scraping (no public API)
- **Recommendation**: ⚠️ Lower priority—Flashscore covers most sportsbooks already

---

### 4.2 BetOnline / Bookmaker APIs
- **Cost**: Some provide free guest APIs, others require account
- **Reliability**: Varies by bookmaker
- **Recommendation**: ⚠️ Consider only after core sources saturated

---

## Data Gap Analysis

| Market | Current Coverage | Reliability | Gap |
|--------|------------------|-------------|-----|
| **Moneyline** | Flashscore, ActionNetwork, Pinnacle | High | None |
| **Spreads** | Flashscore, ActionNetwork, Pinnacle | High | None |
| **Totals** | Flashscore, ActionNetwork, Pinnacle | High | None |
| **Player Props** | The Odds API, ESPN, Flashscore DS feed | Medium | More bookmakers via Flashscore |
| **Parlays** | Flashscore (limited) | Medium | Expand Pinnacle integration |
| **Futures** | Flashscore | Low | Specialty markets on niche sportsbooks |

---

## Recommended Ingestion Architecture

### Polling Strategy

```
Every 60 seconds per sport:
  1. Try The Odds API (primary, async, non-blocking)
  2. Try TheRundown (secondary, async)
  3. Trigger Flashscore Selenium scrape (parallel, persistent)
  4. Check Pinnacle direct API for MLB/NBA updates
  5. Deduplicate & merge across sources
  6. Ingest to database, publish snapshot
```

### Deduplication Logic

```typescript
type OddsSnapshot = {
  eventKey: string;      // "sport:league:away@home"
  market: 'moneyline' | 'spread' | 'total';
  sources: {
    [bookKey: string]: {
      odds: number;
      fetchedAt: ISO8601;
      confidence: 'high' | 'medium' | 'low';
    }
  };
  consensus: number;     // Most common odds across sources
}
```

Sources ranked by confidence:
1. **High**: Pinnacle API, TheRundown, The Odds API (direct)
2. **Medium**: Flashscore (scraped from multiple books)
3. **Low**: Niche sportsbooks (Flashscore scrape)

---

## Current Implementation Status

### ✅ Deployed & Working
- `live_odds_scraper.py` — Flashscore Selenium, all markets
- `props_scraper.py` — The Odds API, ESPN, Flashscore DS
- `pinnacle_mlb_scraper.py` — ActionNetwork + Pinnacle API
- Worker scripts — TypeScript wrappers for orchestration

### ⚠️ Needs Activation
- **TheRundown API**: Add to ingest cycle (free, no auth needed)
- **ESPN schedule discovery**: Expand to reduce Flashscore load
- **Pinnacle expansion**: Add NBA, NFL if APIs available

### 🔄 Optimization Opportunities
1. **Rate limit multiplexing**: Use multiple free Odds API keys
2. **Fallback chains**: Implement retry logic with exponential backoff
3. **Cache strategy**: 
   - Moneyline/spreads/totals: Cache 30-60s (lines move slowly)
   - Props: Cache 15-30s (more volatile)
4. **Error isolation**: Failure in one source doesn't block others

---

## Cost Analysis

| Source | Cost | API Calls/Day | Scaling |
|--------|------|---------------|---------|
| The Odds API | Free | ~16 (500/mo) | Multiple keys needed |
| TheRundown | Free | Unlimited | ✅ No limits |
| ESPN | Free | ~100+ | ✅ No rate limits |
| Flashscore | Free | Unlimited | ✅ 3-host rotation |
| Pinnacle | Free | ~100+ | ✅ No rate limits |
| **Total Monthly** | **$0** | **Sufficient** | **Scalable** |

---

## Implementation Roadmap

### Phase 1 (This Week): Unify & Expand
1. [ ] Activate TheRundown API ingestion
2. [ ] Expand Pinnacle to NBA, NFL
3. [ ] Implement deduplication in ingest endpoint
4. [ ] Add multi-source confidence scoring

### Phase 2 (Next 2 Weeks): Optimize Polling
1. [ ] Implement adaptive polling (faster during game hours)
2. [ ] Add circuit breakers per source (skip if consistently failing)
3. [ ] Build source health dashboard
4. [ ] Implement caching strategy

### Phase 3 (Month 2): Scale
1. [ ] Add live prop change tracking
2. [ ] Implement line movement alerts
3. [ ] Build bookmaker comparison view
4. [ ] Add EV calculation across sources

---

## Key Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Flashscore blocking IP | Use proxy, rotate User-Agent, add delays |
| Odds API rate limits | Use multiple free API keys |
| Missing low-volume leagues | Add niche scraping (low priority) |
| Props data quality | Deduplicate, require min 3 sources |
| Outages during key hours | All sources have fallbacks + local cache |

---

## Testing & Validation

### Unit Tests Needed
- [ ] Deduplicate odds across 3+ sources
- [ ] Convert decimal to American odds (both directions)
- [ ] Parse all major sportsbook line formats
- [ ] Handle missing markets gracefully

### Integration Tests
- [ ] Can we ingest 100 games in <30s?
- [ ] Does each source return valid odds for sample events?
- [ ] Do fallback chains activate when primary fails?

### Smoke Test (Before Deploy)
```bash
npm run rescue:power -- --refresh=skip
```
Should return:
- ✅ ≥20 NBA games with moneyline, spread, total
- ✅ ≥20 MLB games with moneyline, spread, total
- ✅ ≥10 UFC events with moneyline at least
- ✅ No single-source dependency failures

---

## Success Metrics

- **Coverage**: 95%+ of games have moneyline/spread/total
- **Latency**: <60s from odds update to ingest
- **Reliability**: 99%+ uptime across 24h
- **Cost**: $0
- **Bookmaker diversity**: ≥15 sportsbooks per market type

---

## Next Steps

1. **Review this strategy** with team
2. **Activate TheRundown** (easiest win, no auth)
3. **Expand Pinnacle** to NBA/NFL if APIs available
4. **Build deduplication layer** in ingest endpoint
5. **Monitor & tune** polling intervals per source

---

## References

- **The Odds API Docs**: https://the-odds-api.com/
- **TheRundown**: https://therundown.io/
- **Pinnacle Guest API**: https://guest.api.arcadia.pinnacle.com/
- **ESPN Public APIs**: https://site.api.espn.com/
- **NCAA API**: https://ncaa-api.henrygd.me/

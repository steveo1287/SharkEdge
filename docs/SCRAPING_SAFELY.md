# 🛡️ Smart Scraping: Aggressive but Safe

You want results. You don't want to get IP-banned. Here's how to be aggressive without burning your IP.

---

## The Golden Rule

**Flashscore blocks bots, not humans.**

If you look like a human, you won't get banned. Key indicators:
- ✅ Realistic delays between requests (0.5-3s, randomized)
- ✅ Real browser user agents (rotated)
- ✅ Real browser headers (Accept, DNT, Sec-*, etc.)
- ✅ Respects HTTP rate-limit headers
- ✅ Backs off on 429 errors

If you violate these:
- ❌ Requests every 100ms → Obvious bot
- ❌ Same user agent 1000x → Obvious bot
- ❌ Ignore 429 errors → Obvious bot
- ❌ No delay at all → Obvious bot

---

## Three Tiers of Safety

### 🟢 SAFE (Recommended)

```python
# Safe config - low risk of ban
config = RequestConfig(
    min_delay_seconds=1.0,      # At least 1s between requests
    max_delay_seconds=3.0,      # Up to 3s (randomized)
    rotate_user_agent=True,     # Different browser every request
    circuit_breaker_threshold=5, # Back off after 5 errors
)

# With this config:
# - 6 sports × 20 events × 3 sec delay = 6 min per cycle
# - Still 10x faster than sequential
# - Zero ban risk
```

**When to use**: All the time. This is bulletproof.

### 🟡 MODERATE (Use With Caution)

```python
# Moderate config - some ban risk
config = RequestConfig(
    min_delay_seconds=0.5,      # 500ms minimum
    max_delay_seconds=1.5,      # Up to 1.5s
    circuit_breaker_threshold=3, # Back off after 3 errors
)

# With this config:
# - 6 sports × 20 events × 1 sec delay = 2 min per cycle
# - 3x faster than safe mode
# - Low ban risk if errors are normal
# - RISK: If Flashscore changes detection, you could get 429s
```

**When to use**: After running safe for 2 weeks and confirming no issues.

### 🔴 AGGRESSIVE (Requires Proxy)

```python
# Aggressive config - ONLY WITH PROXY
config = RequestConfig(
    min_delay_seconds=0.2,      # 200ms minimum
    max_delay_seconds=0.8,      # Up to 800ms
    rotate_user_agent=True,
    circuit_breaker_threshold=2, # Back off quickly
)

# Plus: Use proxy rotation
# PROXY_URL="http://your-proxy-service:port"

# With this config + proxy:
# - 6 sports × 20 events × 0.5 sec delay = 1 min per cycle
# - 10x faster than safe mode
# - Each request from different IP = no ban possible
```

**When to use**: Only if you have a proxy service ($30/mo).

---

## How Anti-Ban Protection Works

### 1️⃣ Realistic Delays (Most Important)

Humans don't click every 100ms. They think, they wait.

```python
# BAD: No delay (instant 429)
for event in events:
    scrape(event)  # 1000 req in 2 seconds = BAN

# GOOD: Human-like delay (stays under radar)
for event in events:
    time.sleep(random.uniform(1.0, 3.0))  # 1-3 seconds
    scrape(event)  # 20 req per minute = safe
```

With parallel scraping:
- Safe: 6 sports in parallel, 1-3s delays = ~20 req/min = OK
- Moderate: 6 sports in parallel, 0.5-1.5s delays = ~40 req/min = OK
- Aggressive: 6 sports in parallel, 0.2-0.8s delays + proxy = ~120 req/min = OK

---

### 2️⃣ User Agent Rotation (Second Most Important)

Flashscore checks: "Did I get 10,000 requests from `Chrome/124.0.0.0` in 1 minute?"

If yes, you're a bot.

```python
# BAD: Same user agent always
headers = {"User-Agent": "Mozilla/5.0 (Windows...)"}
for i in range(1000):
    requests.get(url, headers=headers)  # 1000 identical requests = BAN

# GOOD: Different user agent each time
user_agents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124...",
    "Mozilla/5.0 (X11; Linux x86_64) Firefox/125...",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari...",
]
for i in range(1000):
    headers = {"User-Agent": random.choice(user_agents)}
    requests.get(url, headers=headers)  # Distributed across 3 agents = OK
```

---

### 3️⃣ Respect HTTP Headers (Circuit Breaker)

When Flashscore starts blocking, they send signals:

- **429 Too Many Requests** — "You're too fast"
- **Retry-After: 60** — "Wait 60 seconds before trying again"
- **X-RateLimit-Reset** — "Try again after this timestamp"

Our circuit breaker listens:

```python
# When we get 429, we:
# 1. Wait the time Flashscore told us to wait
# 2. Slow down our request rate
# 3. If we get too many 429s, pause for 5 minutes
# 4. Then resume carefully

scraper.after_error(status_code=429, headers={"Retry-After": "60"})
# Scraper now waits 60 seconds before next request
```

**Key insight**: If you ignore these headers, Flashscore escalates to permanent IP ban.

---

## Monitoring: Know When You're Getting Close

```python
# Check scraper status after each cycle
status = scraper.get_status()
print(status)
# Output: "Requests: 120 | Errors: 2 (1.7%) | Circuit: 🟢 OK"

# Error rate guide:
# 0-2% errors: Safe, you're fine
# 2-5% errors: Getting close to limits, might slow down slightly
# 5-10% errors: Slow down NOW, increase delays
# >10% errors: You're being blocked, need proxy
```

---

## Detecting If You're About to Get Banned

Watch your logs for these patterns:

### 🟢 HEALTHY
```
✅ 100 successful requests, 0 errors
✅ 150 successful requests, 1 error
Requests: 150 | Errors: 1 (0.7%) | Circuit: 🟢 OK
```

### 🟡 WARNING (Slow Down)
```
⚠️ Got 429 (rate limited). Error #1
⚠️ Got 429 (rate limited). Error #2
⚠️ Got 429 (rate limited). Error #3
Requests: 200 | Errors: 15 (7.5%) | Circuit: 🟢 OK
→ Increase min_delay to 2-3 seconds
```

### 🔴 CRITICAL (Add Proxy or Stop)
```
⚠️ Got 429 (rate limited). Error #4
⚠️ Got 429 (rate limited). Error #5
🛑 Circuit breaker open. Pausing for 300s to avoid permanent ban.
Requests: 250 | Errors: 30 (12%) | Circuit: 🔴 OPEN
→ You need a proxy, or you're about to get permanently banned
```

---

## The Safe Path (Recommended)

### Week 1: Establish Baseline

```python
# Safe config
min_delay = 2.0  # Conservative
max_delay = 4.0
circuit_breaker_threshold = 3

# Expected: ~12 requests/minute, 0 errors
```

Monitor logs for 1 week. If error rate is 0-1%, you're golden.

### Week 2-3: Optimize

If week 1 is clean, gradually increase aggression:

```python
# Slightly faster
min_delay = 1.0
max_delay = 2.5

# Expected: ~30 requests/minute, 0-1% errors
```

Monitor for 1 week. If still clean, continue.

### Week 4+: Full Speed

```python
# Full parallel with smart delays
min_delay = 0.5
max_delay = 1.5

# Expected: ~60 requests/minute, 0-2% errors
# Circuit breaker backs off if it gets higher
```

**This approach**: Never gets banned, gradually ramps up speed.

---

## With Proxy: Go Full Speed

If you add a $30/mo proxy service:

```python
# Aggressive with proxy
PROXY_URL = "http://your-proxy:port"
min_delay = 0.2
max_delay = 0.8

# Expected: ~120 requests/minute from different IPs
# No ban possible because each request is from different IP
```

---

## Checklist: Safe Scraping

- [ ] Using `flashscore_anti_ban.py` for rate limiting
- [ ] Circuit breaker enabled (backs off on 429s)
- [ ] User agent rotation enabled
- [ ] Realistic delays (0.5-3s minimum)
- [ ] Monitoring error rate in logs
- [ ] Under 5% error rate after 1 week
- [ ] Not ignoring HTTP error headers
- [ ] Optional: Proxy service if going aggressive

---

## TL;DR

**Be aggressive, but smart:**

1. **Use realistic delays** (1-3 seconds) — most important
2. **Rotate user agents** — second most important
3. **Respect HTTP headers** (429, Retry-After) — critical
4. **Monitor error rate** — should be <2%
5. **Use circuit breaker** — backs off automatically
6. **Optional: Add proxy** — if you want zero ban risk

**Safe config**: 1-3s delays, parallel polling, 20-30 req/min, 0% ban risk.

**Aggressive config**: 0.2-0.8s delays + proxy, parallel polling, 100+ req/min, 0% ban risk.

You can have both speed AND safety. Don't choose one.

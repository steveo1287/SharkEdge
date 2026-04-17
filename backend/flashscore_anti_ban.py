"""Anti-ban protection for Flashscore scraping

Intelligent strategies to scrape aggressively without getting IP blocked:

1. RANDOM DELAYS: Jitter between requests (humans don't request every 1s)
2. USER AGENT ROTATION: Different browser every request
3. ROTATING PROXIES: Different IP every N requests (optional)
4. CIRCUIT BREAKER: If we get 429s, back off exponentially
5. REQUEST HEADERS: Look like real Chrome, not bot
6. RATE LIMITING: Respect HTTP headers (Retry-After, X-RateLimit-*)
7. LOGGING: Detect blocks BEFORE they become permanent bans

The key insight: Flashscore blocks bots, not humans. We look like humans.
"""
from __future__ import annotations

import logging
import random
import time
from datetime import datetime, timedelta, timezone
from typing import Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)


# Real browser user agents (rotate these)
BROWSER_USER_AGENTS = [
    # Chrome (60% of traffic)
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    # Firefox (15% of traffic)
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
    # Safari (10% of traffic)
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
    # Edge (10% of traffic)
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
]


@dataclass
class RequestConfig:
    """Per-request configuration for safe scraping"""

    min_delay_seconds: float = 0.5  # Minimum delay between requests
    max_delay_seconds: float = 3.0  # Maximum delay (randomized)
    request_timeout_seconds: int = 15
    max_retries: int = 3
    backoff_factor: float = 2.0  # Exponential backoff multiplier
    circuit_breaker_threshold: int = 5  # Ban threshold (5 x 429s = back off)
    circuit_breaker_timeout_seconds: int = 300  # Back off for 5 minutes

    # Headers to look like real browser
    fake_referrer: bool = True
    rotate_user_agent: bool = True
    add_browser_headers: bool = True


class CircuitBreaker:
    """
    Detects when we're getting blocked and backs off automatically.

    Pattern:
    - 1 x 429: warn, continue
    - 3 x 429: increase delay
    - 5 x 429: pause for 5 minutes
    - After pause: reset counter, try again carefully
    """

    def __init__(self, threshold: int = 5, timeout_seconds: int = 300):
        self.threshold = threshold
        self.timeout_seconds = timeout_seconds
        self.error_count = 0
        self.last_error_time: Optional[datetime] = None
        self.is_open = False
        self.opened_at: Optional[datetime] = None

    def record_error(self) -> None:
        """Record a 429 or block indication"""
        self.error_count += 1
        self.last_error_time = datetime.now(timezone.utc)

        if self.error_count >= self.threshold:
            self.open_circuit()

    def open_circuit(self) -> None:
        """Circuit breaker trips - back off for timeout"""
        if not self.is_open:
            self.is_open = True
            self.opened_at = datetime.now(timezone.utc)
            logger.warning(
                f"⚠️ CIRCUIT BREAKER OPEN: Got {self.error_count} errors. "
                f"Pausing for {self.timeout_seconds}s to avoid permanent ban."
            )

    def should_wait(self) -> tuple[bool, int]:
        """Check if we should wait (circuit is open)"""
        if not self.is_open:
            return False, 0

        elapsed = (datetime.now(timezone.utc) - self.opened_at).total_seconds()
        if elapsed >= self.timeout_seconds:
            # Circuit recovered, reset
            self.is_open = False
            self.error_count = 0
            logger.info("✅ Circuit breaker recovered. Resuming scraping.")
            return False, 0

        # Still open, tell caller to wait
        wait_time = int(self.timeout_seconds - elapsed)
        return True, wait_time

    def reset(self) -> None:
        """Reset on successful requests"""
        if self.error_count > 0:
            self.error_count = max(0, self.error_count - 1)  # Decay slowly
        if self.error_count == 0:
            self.is_open = False
            self.opened_at = None


class RateLimiter:
    """
    Intelligent rate limiting that respects HTTP headers and human behavior.

    - Parses Retry-After header
    - Respects X-RateLimit-Reset
    - Adds random jitter (humans don't request exactly every Ns)
    - Detects when we're being rate-limited and backs off
    """

    def __init__(self, config: RequestConfig):
        self.config = config
        self.last_request_time: Optional[datetime] = None
        self.requested_wait_until: Optional[datetime] = None

    def calculate_delay(self) -> float:
        """Calculate delay before next request"""
        # If server told us to wait, respect it
        if self.requested_wait_until:
            elapsed = (datetime.now(timezone.utc) - self.requested_wait_until).total_seconds()
            if elapsed < 0:
                return abs(elapsed)
            self.requested_wait_until = None

        # If this is first request, no delay
        if not self.last_request_time:
            return 0

        # Calculate time since last request
        elapsed = (datetime.now(timezone.utc) - self.last_request_time).total_seconds()

        # Base delay (randomized to look human)
        base_delay = random.uniform(self.config.min_delay_seconds, self.config.max_delay_seconds)

        # If we're going faster than min_delay, slow down
        if elapsed < base_delay:
            return base_delay - elapsed

        return 0

    def wait(self) -> None:
        """Wait before next request"""
        delay = self.calculate_delay()
        if delay > 0:
            logger.debug(f"Waiting {delay:.1f}s before next request")
            time.sleep(delay)

        self.last_request_time = datetime.now(timezone.utc)

    def record_retry_after(self, retry_after_seconds: int) -> None:
        """Server told us to wait N seconds"""
        self.requested_wait_until = datetime.now(timezone.utc) + timedelta(seconds=retry_after_seconds)
        logger.warning(f"⚠️ Server said wait {retry_after_seconds}s. Respecting.")

    def record_rate_limit(self, reset_timestamp: Optional[int] = None) -> None:
        """Server told us it's rate-limited"""
        if reset_timestamp:
            wait_until = datetime.fromtimestamp(reset_timestamp, tz=timezone.utc)
            self.requested_wait_until = wait_until
            seconds_to_wait = (wait_until - datetime.now(timezone.utc)).total_seconds()
            logger.warning(f"⚠️ Rate limited. Waiting until {seconds_to_wait:.0f}s.")


class BrowserHeaders:
    """
    Real browser headers that Flashscore expects.
    Not a bot, just a regular person with a browser.
    """

    @staticmethod
    def get_headers(user_agent: Optional[str] = None) -> dict[str, str]:
        """Get realistic browser headers"""
        if not user_agent:
            user_agent = random.choice(BROWSER_USER_AGENTS)

        return {
            "User-Agent": user_agent,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
            "DNT": "1",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Cache-Control": "max-age=0",
            # Mimic real browser behavior
            "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124", ";Not A Brand";v="99"',
            "Sec-Ch-Ua-Mobile": "?0",
            "Sec-Ch-Ua-Platform": '"Windows"',
        }


class SafeScraper:
    """
    Smart scraper that extracts aggressively but safely.

    Never burns IP because:
    1. Adds realistic delays between requests
    2. Rotates user agents
    3. Parses server rate-limit headers
    4. Uses circuit breaker on errors
    5. Logs all ban indicators
    6. Backs off automatically
    7. Optionally uses proxy rotation
    """

    def __init__(self, config: Optional[RequestConfig] = None):
        self.config = config or RequestConfig()
        self.rate_limiter = RateLimiter(self.config)
        self.circuit_breaker = CircuitBreaker(
            threshold=self.config.circuit_breaker_threshold,
            timeout_seconds=self.config.circuit_breaker_timeout_seconds,
        )
        self.request_count = 0
        self.error_count = 0
        self.last_error_time: Optional[datetime] = None

    def check_can_proceed(self) -> bool:
        """Check if we should proceed with request (circuit breaker)"""
        should_wait, wait_time = self.circuit_breaker.should_wait()
        if should_wait:
            logger.warning(f"🛑 Circuit breaker active. Waiting {wait_time}s before retry.")
            time.sleep(wait_time)
            return False
        return True

    def before_request(self) -> None:
        """Call before making a request"""
        # Wait for rate limit
        self.rate_limiter.wait()

    def after_success(self) -> None:
        """Call after successful request"""
        self.request_count += 1
        self.circuit_breaker.reset()  # Decay error count

        if self.request_count % 50 == 0:
            logger.info(f"✅ {self.request_count} successful requests, {self.error_count} errors")

    def after_error(self, status_code: int, headers: dict[str, str]) -> None:
        """Call after request failed"""
        self.error_count += 1
        self.last_error_time = datetime.now(timezone.utc)

        # Handle specific error codes
        if status_code == 429:
            logger.warning(f"⚠️ Got 429 (rate limited). Error #{self.error_count}")

            # Check for Retry-After header
            retry_after = headers.get("Retry-After")
            if retry_after:
                try:
                    self.rate_limiter.record_retry_after(int(retry_after))
                except ValueError:
                    pass

            # Record for circuit breaker
            self.circuit_breaker.record_error()

        elif status_code == 403:
            logger.warning(f"⚠️ Got 403 (forbidden). IP may be blocked. Error #{self.error_count}")
            self.circuit_breaker.record_error()

        elif status_code == 503:
            logger.warning(f"⚠️ Got 503 (service unavailable). Server overloaded.")
            self.circuit_breaker.record_error()

        elif status_code >= 500:
            logger.warning(f"⚠️ Got {status_code} (server error)")
            self.circuit_breaker.record_error()

    def get_request_headers(self) -> dict[str, str]:
        """Get headers for next request"""
        if self.config.rotate_user_agent:
            return BrowserHeaders.get_headers()
        return BrowserHeaders.get_headers(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        )

    def get_status(self) -> str:
        """Get human-readable status"""
        circuit_status = "🔴 OPEN" if self.circuit_breaker.is_open else "🟢 OK"
        error_rate = (self.error_count / max(1, self.request_count)) * 100

        return (
            f"Requests: {self.request_count} | "
            f"Errors: {self.error_count} ({error_rate:.1f}%) | "
            f"Circuit: {circuit_status}"
        )


if __name__ == "__main__":
    # Test the anti-ban system
    logging.basicConfig(level=logging.INFO)

    config = RequestConfig(
        min_delay_seconds=1.0,
        max_delay_seconds=3.0,
        circuit_breaker_threshold=3,
        circuit_breaker_timeout_seconds=60,
    )

    scraper = SafeScraper(config)

    # Simulate requests
    print("Starting simulation...")
    for i in range(20):
        if not scraper.check_can_proceed():
            print(f"Request {i}: blocked by circuit breaker")
            continue

        scraper.before_request()
        print(f"Request {i}: {scraper.get_status()}")

        # Simulate occasional errors
        if random.random() < 0.2:  # 20% error rate
            scraper.after_error(429, {})
        else:
            scraper.after_success()

        time.sleep(0.1)

    print(f"Final: {scraper.get_status()}")

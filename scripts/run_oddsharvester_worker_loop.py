#!/usr/bin/env python3
from __future__ import annotations

import os
import subprocess
import sys
import time
from urllib.parse import urlparse


def get_int_env(name: str, default: int) -> int:
    raw = os.getenv(name, str(default)).strip()
    try:
        value = int(raw)
        if value <= 0:
            raise ValueError
        return value
    except ValueError as exc:
        raise RuntimeError(f"{name} must be a positive integer, got '{raw}'") from exc


def ensure_backend_url() -> str:
    url = os.getenv("SHARKEDGE_BACKEND_URL", "").strip()
    if not url:
        raise RuntimeError(
            "SHARKEDGE_BACKEND_URL is required. For Railway internal routing use http://sharkedge-web:3000"
        )

    host = (urlparse(url).hostname or "").lower()
    if host in {"app.sharkedge.com", "www.app.sharkedge.com"}:
        raise RuntimeError(
            "SHARKEDGE_BACKEND_URL points at the frontend domain. "
            "Use internal Railway URL, for example: http://sharkedge-web:3000"
        )
    return url.rstrip("/")


def main() -> None:
    backend_url = ensure_backend_url()
    interval_seconds = get_int_env("POLL_INTERVAL_SECONDS", 900)
    max_backoff_seconds = get_int_env("WORKER_MAX_BACKOFF_SECONDS", 300)
    initial_delay_seconds = int(os.getenv("WORKER_STARTUP_DELAY_SECONDS", "5").strip() or "5")

    if initial_delay_seconds > 0:
        print(f"[oddsharvester-worker] startup delay {initial_delay_seconds}s")
        time.sleep(initial_delay_seconds)

    print(
        f"[oddsharvester-worker] running with backend={backend_url} interval={interval_seconds}s "
        f"max_backoff={max_backoff_seconds}s"
    )

    consecutive_failures = 0
    while True:
        started_at = time.strftime("%Y-%m-%d %H:%M:%S")
        print(f"[oddsharvester-worker] cycle start {started_at}")

        run = subprocess.run([sys.executable, "scripts/local_oddsharvester_push.py"], check=False)
        if run.returncode == 0:
            consecutive_failures = 0
            print(f"[oddsharvester-worker] cycle ok, sleeping {interval_seconds}s")
            time.sleep(interval_seconds)
            continue

        consecutive_failures += 1
        backoff_seconds = min(interval_seconds, min(max_backoff_seconds, 30 * consecutive_failures))
        print(
            f"[oddsharvester-worker] cycle failed with code {run.returncode}; "
            f"consecutive_failures={consecutive_failures}; retry in {backoff_seconds}s"
        )
        time.sleep(backoff_seconds)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # pragma: no cover
        print(f"[oddsharvester-worker] fatal: {exc}")
        raise

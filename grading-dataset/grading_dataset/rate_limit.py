"""Conservative per-domain rate limiting with exponential backoff."""

from __future__ import annotations

import random
import time
from collections import defaultdict
from urllib.parse import urlparse

from grading_dataset.config import RateLimitConfig
from grading_dataset.legal import LegalBlock, looks_like_block_page


class DomainRateLimiter:
    def __init__(self, config: RateLimitConfig) -> None:
        self.config = config
        self._next_ok: dict[str, float] = defaultdict(float)
        self._fail_streak: dict[str, int] = defaultdict(int)
        self.stopped_domains: dict[str, str] = {}

    def domain(self, url: str) -> str:
        return urlparse(url).netloc.lower()

    def wait(self, url: str) -> None:
        host = self.domain(url)
        if host in self.stopped_domains:
            raise LegalBlock(
                f"Stopped requesting {host}: {self.stopped_domains[host]}"
            )
        delay = random.uniform(
            self.config.min_interval_seconds, self.config.max_interval_seconds
        )
        streak = self._fail_streak[host]
        if streak:
            delay = min(
                self.config.max_backoff_seconds,
                delay * (2 ** streak),
            )
        sleep_for = self._next_ok[host] - time.monotonic()
        if sleep_for > 0:
            time.sleep(sleep_for)
        extra = delay
        self._next_ok[host] = time.monotonic() + extra

    def observe(
        self,
        url: str,
        status_code: int | None,
        body_text: str = "",
    ) -> None:
        host = self.domain(url)
        if looks_like_block_page(status_code, body_text):
            reason = f"HTTP {status_code} or block/CAPTCHA page"
            self.stopped_domains[host] = reason
            raise LegalBlock(
                f"Stopping all requests to {host} ({reason}). "
                "Do not rotate identities, proxies, or fingerprints."
            )
        if status_code in self.config.backoff_statuses:
            self._fail_streak[host] += 1
            return
        if status_code is not None and 200 <= status_code < 300:
            self._fail_streak[host] = 0

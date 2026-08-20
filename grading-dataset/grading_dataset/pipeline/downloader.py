"""Safe HTTP downloads for already-approved official endpoints only."""

from __future__ import annotations

import hashlib
from pathlib import Path

import httpx

from grading_dataset.config import PipelineConfig
from grading_dataset.db import PipelineDB
from grading_dataset.legal import LegalBlock
from grading_dataset.logging_utils import log_event
from grading_dataset.rate_limit import DomainRateLimiter

USER_AGENT = "TCGTracker-grading-dataset/0.1 (research pipeline; respects robots.txt and ToS)"


class ImageDownloader:
    def __init__(
        self,
        config: PipelineConfig,
        db: PipelineDB,
        limiter: DomainRateLimiter,
        logger,
    ) -> None:
        self.config = config
        self.db = db
        self.limiter = limiter
        self.logger = logger
        self.client = httpx.Client(
            headers={"User-Agent": USER_AGENT},
            follow_redirects=True,
            timeout=60.0,
        )

    def close(self) -> None:
        self.client.close()

    def fetch_bytes(self, url: str, dest: Path, sample_id: str) -> tuple[bytes, str]:
        if self.db.download_complete(url) and dest.exists():
            data = dest.read_bytes()
            digest = hashlib.sha256(data).hexdigest()
            log_event(
                self.logger,
                event="download_skip",
                url=url,
                sample_id=sample_id,
                reason="already_complete",
            )
            return data, digest
        self.limiter.wait(url)
        response = self.client.get(url)
        body_preview = ""
        content_type = response.headers.get("content-type", "")
        if "text" in content_type or "html" in content_type:
            body_preview = response.text[:2000]
        try:
            self.limiter.observe(url, response.status_code, body_preview)
        except LegalBlock:
            self.db.log_error(
                "Stopped domain after block page",
                url=url,
                http_status=response.status_code,
            )
            raise
        log_event(
            self.logger,
            event="download",
            url=url,
            sample_id=sample_id,
            http_status=response.status_code,
            source_host=self.limiter.domain(url),
        )
        if response.status_code != 200:
            self.db.mark_download(
                sample_id,
                url,
                local_path=None,
                http_status=response.status_code,
                sha256=None,
                completed=False,
            )
            raise RuntimeError(f"HTTP {response.status_code} for {url}")
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(response.content)
        digest = hashlib.sha256(response.content).hexdigest()
        self.db.mark_download(
            sample_id,
            url,
            local_path=str(dest),
            http_status=response.status_code,
            sha256=digest,
            completed=True,
        )
        return response.content, digest

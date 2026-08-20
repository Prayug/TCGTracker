"""Legal gates. Collection must fail closed."""

from __future__ import annotations

from dataclasses import dataclass

from grading_dataset.catalog import SourceRecord, source_by_id
from grading_dataset.config import PipelineConfig


class LegalBlock(RuntimeError):
    """Raised when a source must not be collected."""


@dataclass(frozen=True)
class LegalReview:
    source_id: str
    allowed: bool
    reasons: tuple[str, ...]


STOP_PAGE_MARKERS = (
    "captcha",
    "are you a robot",
    "i am not a robot",
    "cf-challenge",
    "attention required",
    "access denied",
    "perimeterx",
    "datadome",
)


def review_source(source: SourceRecord, config: PipelineConfig) -> LegalReview:
    reasons: list[str] = []
    if not config.collection_enabled:
        reasons.append("global collection_enabled is false (Phase 1 default)")
    if not source.collection_allowed:
        reasons.append("source.collection_allowed is false")
    if source.scraping_permission == "prohibited":
        reasons.append("automated retrieval is prohibited")
    if source.recommendation == "not_recommended":
        reasons.append("discovery marked this source not recommended")
    if source.scraping_permission == "unknown":
        reasons.append("scraping/API permission is unknown")
    allowed = not reasons
    return LegalReview(source.id, allowed, tuple(reasons))


def assert_may_collect(source_id: str, config: PipelineConfig) -> SourceRecord:
    source = source_by_id(source_id)
    decision = review_source(source, config)
    if not decision.allowed:
        joined = "; ".join(decision.reasons)
        raise LegalBlock(
            f"Refusing collection from {source_id}: {joined}. "
            "Do not bypass site protections. Re-run discovery after written approval."
        )
    return source


def looks_like_block_page(status_code: int | None, body_text: str = "") -> bool:
    if status_code in (401, 403):
        return True
    lowered = (body_text or "").lower()
    return any(marker in lowered for marker in STOP_PAGE_MARKERS)


def license_allowed(license_id: str, config: PipelineConfig) -> bool:
    normalized = (license_id or "").strip().lower()
    if not normalized:
        return False
    allowed = {item.lower() for item in config.allowed_licenses}
    return normalized in allowed

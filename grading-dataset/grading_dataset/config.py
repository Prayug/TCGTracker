"""Pipeline configuration. Collection stays off until sources are approved."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG_PATH = ROOT / "config.yaml"


class QualityThresholds(BaseModel):
    min_shortest_side: int = 280
    prefer_shortest_side: int = 1000
    min_blur_score: float = 0.35
    max_glare_fraction: float = 0.25
    min_card_coverage: float = 0.20
    min_crop_confidence: float = 0.50
    reject_thumbnails_max_side: int = 320


class QuotaConfig(BaseModel):
    target_per_grade: int = 3000
    pilot_per_grade: int = 100
    max_identity_fraction_per_grade: float = 0.05


class RateLimitConfig(BaseModel):
    min_interval_seconds: float = 1.5
    max_interval_seconds: float = 3.0
    hub_interval_seconds: float = 0.25
    backoff_statuses: tuple[int, ...] = (429, 500, 502, 503, 504)
    stop_statuses: tuple[int, ...] = (401, 403)
    max_backoff_seconds: float = 120.0


class SplitConfig(BaseModel):
    train: float = 0.80
    validation: float = 0.10
    test: float = 0.10
    seed: int = 42
    ood_holdout_sets: list[str] = Field(default_factory=list)


class QaConfig(BaseModel):
    every_n_downloads: int = 500
    sample_size: int = 20
    source_error_rate_pause: float = 0.15


class PipelineConfig(BaseModel):
    dataset_dir: Path = ROOT / "dataset"
    reports_dir: Path = ROOT / "reports"
    qa_dir: Path = ROOT / "qa"
    sqlite_path: Path = ROOT / "dataset" / "pipeline.sqlite"
    log_path: Path = ROOT / "reports" / "collection.log"
    min_grade: int = 1
    max_grade: int = 10
    quality: QualityThresholds = Field(default_factory=QualityThresholds)
    quota: QuotaConfig = Field(default_factory=QuotaConfig)
    rate_limit: RateLimitConfig = Field(default_factory=RateLimitConfig)
    splits: SplitConfig = Field(default_factory=SplitConfig)
    qa: QaConfig = Field(default_factory=QaConfig)
    allowed_licenses: list[str] = Field(
        default_factory=lambda: [
            "cc-by-4.0",
            "cc-by-sa-4.0",
            "cc0-1.0",
            "odc-by",
            "cdla-permissive-2.0",
            "psa-written-research-license",
            "contributor-agreement",
            "huggingface-hub-public-dataset",
        ]
    )
    require_front_and_back_for_training: bool = False
    collection_enabled: bool = False

    @classmethod
    def load(cls, path: Path | None = None) -> "PipelineConfig":
        config_path = path or DEFAULT_CONFIG_PATH
        if not config_path.exists():
            return cls()
        raw: dict[str, Any] = yaml.safe_load(config_path.read_text()) or {}
        return cls.model_validate(_hydrate_paths(raw))


def _hydrate_paths(raw: dict[str, Any]) -> dict[str, Any]:
    out = dict(raw)
    for key in ("dataset_dir", "reports_dir", "qa_dir", "sqlite_path", "log_path"):
        if key in out and out[key]:
            p = Path(out[key])
            out[key] = p if p.is_absolute() else ROOT / p
    return out

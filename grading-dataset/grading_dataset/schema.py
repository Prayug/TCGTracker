"""Canonical record schema, splits, and capture-type rules."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

GradeLabelConfidence = Literal["authoritative", "strong", "weak"]
CaptureType = Literal["slab", "raw", "catalog", "unknown", "mixed", "n_a"]
ValidationStatus = Literal[
    "pending",
    "accepted",
    "rejected",
    "duplicate",
    "weak_holdout",
    "paused_source",
]
SplitName = Literal["train", "validation", "test", "ood_test", "unassigned"]
QaDecision = Literal[
    "ACCEPT",
    "WRONG_GRADE",
    "WRONG_CARD",
    "BAD_IMAGE",
    "DUPLICATE",
    "OTHER",
]


class ImageQualityMetrics(BaseModel):
    blur_score: float | None = None
    glare_fraction: float | None = None
    exposure_mean: float | None = None
    perspective_angle_deg: float | None = None
    card_coverage: float | None = None
    card_crop_confidence: float | None = None
    image_width: int = 0
    image_height: int = 0
    shortest_side: int = 0


class UserContributionFields(BaseModel):
    """Phase 2 schema for raw-photo → actual-PSA supervision."""

    raw_front_images: list[str] = Field(default_factory=list)
    raw_back_images: list[str] = Field(default_factory=list)
    predicted_grade: float | None = None
    submitted_to_psa: bool = False
    psa_cert: str | None = None
    actual_psa_grade: int | None = None


class CardRecord(BaseModel):
    sample_id: str
    source: str
    source_url: str = ""
    source_record_id: str = ""
    certification_company: str = "PSA"
    cert_number: str = ""
    grade: int | None = None
    grade_label: str = ""
    grade_label_confidence: GradeLabelConfidence = "weak"
    card_name: str = ""
    set_name: str = ""
    year: str = ""
    card_number: str = ""
    language: str = ""
    variant: str = ""
    pokemon: str = ""
    foil_type: str = ""
    front_image_url: str = ""
    back_image_url: str = ""
    local_front_path: str = ""
    local_back_path: str = ""
    original_front_path: str = ""
    original_back_path: str = ""
    cropped_front_path: str = ""
    cropped_back_path: str = ""
    rectified_front_path: str = ""
    rectified_back_path: str = ""
    image_width: int = 0
    image_height: int = 0
    license: str = ""
    retrieved_at: str = ""
    validation_status: ValidationStatus = "pending"
    capture_type: CaptureType = "slab"
    split: SplitName = "unassigned"
    quality: ImageQualityMetrics = Field(default_factory=ImageQualityMetrics)
    sha256_front: str = ""
    sha256_back: str = ""
    phash_front: str = ""
    phash_back: str = ""
    has_front: bool = False
    has_back: bool = False
    rejection_reason: str = ""
    user_contribution: UserContributionFields = Field(
        default_factory=UserContributionFields
    )

    @field_validator("grade")
    @classmethod
    def grade_range(cls, value: int | None) -> int | None:
        if value is None:
            return value
        if value < 1 or value > 10:
            raise ValueError("grade must be an integer 1–10")
        return value

    def physical_key(self) -> str:
        """Leakage-safe identity: cert if present, else sample_id."""
        cert = (self.cert_number or "").strip()
        if cert:
            return f"cert:{self.certification_company}:{cert}"
        return f"sample:{self.sample_id}"

    def identity_key(self) -> str:
        name = (self.card_name or "").strip().lower()
        set_name = (self.set_name or "").strip().lower()
        number = (self.card_number or "").strip().lower()
        variant = (self.variant or "").strip().lower()
        return f"{name}|{set_name}|{number}|{variant}"


def training_eligible(record: CardRecord) -> bool:
    """Default training set: authoritative + strong only, accepted, not catalog."""
    if record.validation_status != "accepted":
        return False
    if record.grade_label_confidence not in ("authoritative", "strong"):
        return False
    if record.capture_type == "catalog":
        return False
    if record.grade is None:
        return False
    return True


def record_to_row(record: CardRecord) -> dict[str, Any]:
    data = record.model_dump()
    quality = data.pop("quality")
    contrib = data.pop("user_contribution")
    for key, value in quality.items():
        data[f"quality_{key}"] = value
    for key, value in contrib.items():
        data[f"user_{key}"] = value
    data["physical_key"] = record.physical_key()
    data["identity_key"] = record.identity_key()
    return data


def _nan_to_none(value: Any) -> Any:
    if isinstance(value, float) and value != value:
        return None
    return value


def _unflatten_row(row: dict[str, Any]) -> dict[str, Any]:
    quality: dict[str, Any] = {}
    contrib: dict[str, Any] = {}
    out: dict[str, Any] = {}
    for key, value in row.items():
        if key in {"physical_key", "identity_key"}:
            continue
        cleaned = _nan_to_none(value)
        if key.startswith("quality_"):
            quality[key.removeprefix("quality_")] = cleaned
        elif key.startswith("user_"):
            contrib[key.removeprefix("user_")] = cleaned
        else:
            out[key] = cleaned
    out["quality"] = quality
    out["user_contribution"] = contrib
    return out


def _hydrate_quality_dims(record: CardRecord) -> None:
    width, height = record.image_width, record.image_height
    if not width or not height:
        return
    if not record.quality.image_width:
        record.quality.image_width = width
    if not record.quality.image_height:
        record.quality.image_height = height
    if not record.quality.shortest_side:
        record.quality.shortest_side = min(width, height)


def card_record_from_payload(row: dict[str, Any]) -> CardRecord:
    """Load a CardRecord from nested model_dump() or flattened parquet/sqlite rows."""
    if isinstance(row.get("quality"), dict):
        data = {k: v for k, v in row.items() if k not in {"physical_key", "identity_key"}}
        record = CardRecord.model_validate(data)
    else:
        record = CardRecord.model_validate(_unflatten_row(row))
    _hydrate_quality_dims(record)
    return record

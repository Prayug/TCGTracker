"""Reject low-quality, catalog, thumbnail, and corrupt images. Never upscale."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, UnidentifiedImageError

from grading_dataset.config import PipelineConfig
from grading_dataset.pipeline.quality import blank_fraction, measure_image
from grading_dataset.schema import CardRecord


CATALOG_HINTS = (
    "pokemontcg.io",
    "images.pokemontcg.io",
    "tcgdex.net",
    "limitlesstcg",
    "cardmarket.com/img/cards",
)


def open_image(path: Path) -> Image.Image:
    with Image.open(path) as image:
        image.load()
        return image.copy()


def validate_record_images(
    record: CardRecord, config: PipelineConfig
) -> CardRecord:
    reasons: list[str] = []
    front = Path(record.local_front_path) if record.local_front_path else None
    back = Path(record.local_back_path) if record.local_back_path else None

    if front is None or not front.exists():
        reasons.append("missing_front")
        record.has_front = False
    else:
        try:
            image = open_image(front)
        except (UnidentifiedImageError, OSError):
            reasons.append("corrupt_front")
        else:
            metrics = measure_image(image)
            record.quality = metrics
            record.image_width = metrics.image_width
            record.image_height = metrics.image_height
            record.has_front = True
            reasons.extend(_image_reasons(image, metrics, config, side="front"))

    if back and back.exists():
        try:
            back_image = open_image(back)
        except (UnidentifiedImageError, OSError):
            reasons.append("corrupt_back")
            record.has_back = False
        else:
            record.has_back = True
            back_metrics = measure_image(back_image)
            reasons.extend(_image_reasons(back_image, back_metrics, config, side="back"))
            if (
                record.quality.shortest_side
                and back_metrics.shortest_side < record.quality.shortest_side
            ):
                # Keep front metrics as primary; still reject if back is unusable.
                pass
    else:
        record.has_back = False

    url_blob = " ".join(
        [
            record.front_image_url,
            record.back_image_url,
            record.source_url,
        ]
    ).lower()
    if any(hint in url_blob for hint in CATALOG_HINTS):
        reasons.append("catalog_or_stock_image")

    if record.capture_type == "catalog":
        reasons.append("capture_type_catalog")

    if reasons:
        record.validation_status = "rejected"
        record.rejection_reason = ",".join(reasons)
    else:
        if record.grade_label_confidence == "weak":
            record.validation_status = "weak_holdout"
        else:
            record.validation_status = "accepted"
        record.rejection_reason = ""
    return record


def _image_reasons(image, metrics, config: PipelineConfig, side: str) -> list[str]:
    q = config.quality
    reasons: list[str] = []
    if metrics.shortest_side < q.min_shortest_side:
        reasons.append(f"{side}_below_min_resolution")
    if max(metrics.image_width, metrics.image_height) <= q.reject_thumbnails_max_side:
        reasons.append(f"{side}_thumbnail")
    if metrics.blur_score is not None and metrics.blur_score < q.min_blur_score:
        reasons.append(f"{side}_blurry")
    if metrics.glare_fraction is not None and metrics.glare_fraction > q.max_glare_fraction:
        reasons.append(f"{side}_glare")
    gray = image.convert("L")
    import numpy as np

    arr = np.asarray(gray, dtype=np.float32)
    if blank_fraction(arr) > 0.92:
        reasons.append(f"{side}_mostly_blank")
    return reasons

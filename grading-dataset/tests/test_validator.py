"""Validator rejects thumbnails and does not invent pixels."""

from pathlib import Path

from PIL import Image

from grading_dataset.config import PipelineConfig
from grading_dataset.pipeline.validator import validate_record_images
from grading_dataset.schema import CardRecord


def _write(
    path: Path,
    size: tuple[int, int],
    color: tuple[int, int, int] = (40, 80, 40),
    *,
    textured: bool = False,
) -> None:
    image = Image.new("RGB", size, color)
    if textured:
        import numpy as np

        arr = np.asarray(image).astype(np.int16)
        noise = np.random.default_rng(0).integers(-40, 41, size=arr.shape)
        arr = np.clip(arr + noise, 0, 255).astype(np.uint8)
        image = Image.fromarray(arr)
    image.save(path, quality=95)


def test_thumbnail_rejected(tmp_path: Path):
    front = tmp_path / "tiny.jpg"
    _write(front, (64, 64))
    record = CardRecord(
        sample_id="s1",
        source="test",
        grade=7,
        grade_label_confidence="authoritative",
        local_front_path=str(front),
        capture_type="slab",
    )
    out = validate_record_images(record, PipelineConfig())
    assert out.validation_status == "rejected"
    assert "thumbnail" in out.rejection_reason or "below_min_resolution" in out.rejection_reason


def test_catalog_url_rejected(tmp_path: Path):
    front = tmp_path / "ok.jpg"
    _write(front, (800, 1100), (80, 90, 70), textured=True)
    record = CardRecord(
        sample_id="s2",
        source="test",
        grade=7,
        grade_label_confidence="authoritative",
        local_front_path=str(front),
        front_image_url="https://images.pokemontcg.io/base1/4_hires.png",
        capture_type="slab",
    )
    out = validate_record_images(record, PipelineConfig())
    assert out.validation_status == "rejected"
    assert "catalog" in out.rejection_reason


def test_weak_labels_holdout_not_train(tmp_path: Path):
    front = tmp_path / "ok.jpg"
    _write(front, (800, 1100), (80, 90, 70), textured=True)
    record = CardRecord(
        sample_id="s3",
        source="test",
        grade=10,
        grade_label_confidence="weak",
        local_front_path=str(front),
        capture_type="slab",
    )
    out = validate_record_images(record, PipelineConfig())
    assert out.validation_status == "weak_holdout"


def test_does_not_upscale(tmp_path: Path):
    front = tmp_path / "small.jpg"
    _write(front, (400, 400))
    record = CardRecord(
        sample_id="s4",
        source="test",
        grade=5,
        grade_label_confidence="authoritative",
        local_front_path=str(front),
        capture_type="raw",
    )
    out = validate_record_images(record, PipelineConfig())
    assert out.image_width == 400
    assert out.validation_status == "rejected"

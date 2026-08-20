#!/usr/bin/env python3
"""Crop and rectify card regions. Never overwrites originals."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from grading_dataset.config import PipelineConfig
from grading_dataset.pipeline.cropper import process_image
from grading_dataset.pipeline.metadata import (
    load_records_from_parquet,
    sample_paths,
    write_metadata,
)


def main() -> int:
    config = PipelineConfig.load()
    meta = config.dataset_dir / "metadata.parquet"
    if not meta.exists():
        print("No metadata.parquet yet. Nothing to crop.")
        return 0
    records = load_records_from_parquet(meta)
    for record in records:
        paths = sample_paths(config.dataset_dir, record.sample_id, record.grade)
        if record.local_front_path and Path(record.local_front_path).exists():
            info = process_image(
                Path(record.local_front_path),
                paths["cropped_front"],
                paths["rectified_front"],
            )
            record.cropped_front_path = str(paths["cropped_front"]) if info["cropped_written"] else ""
            record.rectified_front_path = (
                str(paths["rectified_front"]) if info["rectified_written"] else ""
            )
            record.quality.card_crop_confidence = info["card_crop_confidence"]
            record.quality.card_coverage = info["card_coverage"]
            record.quality.perspective_angle_deg = info["perspective_angle_deg"]
        if record.local_back_path and Path(record.local_back_path).exists():
            info = process_image(
                Path(record.local_back_path),
                paths["cropped_back"],
                paths["rectified_back"],
            )
            record.cropped_back_path = str(paths["cropped_back"]) if info["cropped_written"] else ""
            record.rectified_back_path = (
                str(paths["rectified_back"]) if info["rectified_written"] else ""
            )
    write_metadata(records, config.dataset_dir)
    print(f"Cropped {len(records)} records (originals preserved).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

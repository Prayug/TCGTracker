#!/usr/bin/env python3
"""Deduplicate by cert, SHA-256, and perceptual hash."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from grading_dataset.config import PipelineConfig
from grading_dataset.pipeline.deduplicator import (
    DuplicateIndex,
    check_duplicate,
    perceptual_hash,
    sha256_file,
)
from grading_dataset.pipeline.metadata import (
    append_jsonl,
    load_records_from_parquet,
    write_metadata,
)
from grading_dataset.schema import CardRecord


def main() -> int:
    config = PipelineConfig.load()
    meta = config.dataset_dir / "metadata.parquet"
    if not meta.exists():
        print("No metadata.parquet yet. Nothing to deduplicate.")
        return 0
    records = load_records_from_parquet(meta)
    index = DuplicateIndex()
    dup_path = config.dataset_dir / "duplicates.jsonl"
    if dup_path.exists():
        dup_path.unlink()
    kept: list[CardRecord] = []
    for record in records:
        if record.local_front_path and Path(record.local_front_path).exists():
            record.sha256_front = sha256_file(Path(record.local_front_path))
            record.phash_front = perceptual_hash(Path(record.local_front_path))
        if record.local_back_path and Path(record.local_back_path).exists():
            record.sha256_back = sha256_file(Path(record.local_back_path))
            record.phash_back = perceptual_hash(Path(record.local_back_path))
        reason = check_duplicate(record, index)
        if reason:
            record.validation_status = "duplicate"
            record.rejection_reason = reason
            append_jsonl(dup_path, record.model_dump())
        else:
            kept.append(record)
    write_metadata(records, config.dataset_dir)
    print(f"Checked {len(records)}; kept {len(kept)}; duplicates {len(records) - len(kept)}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

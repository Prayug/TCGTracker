#!/usr/bin/env python3
"""Validate local images and write accepted/rejected metadata."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from grading_dataset.config import PipelineConfig
from grading_dataset.db import PipelineDB
from grading_dataset.pipeline.metadata import append_jsonl, write_metadata
from grading_dataset.pipeline.validator import validate_record_images
from grading_dataset.schema import CardRecord, card_record_from_payload


def load_records(db: PipelineDB) -> list[CardRecord]:
    return [card_record_from_payload(row) for row in db.iter_records()]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--from-jsonl", type=Path)
    args = parser.parse_args()
    config = PipelineConfig.load()
    records: list[CardRecord] = []
    if args.from_jsonl:
        for line in args.from_jsonl.read_text(encoding="utf-8").splitlines():
            if line.strip():
                records.append(card_record_from_payload(json.loads(line)))
    else:
        db = PipelineDB(config.sqlite_path)
        records = load_records(db)
        db.close()

    failed = config.dataset_dir / "failed_records.jsonl"
    if failed.exists():
        failed.unlink()
    accepted: list[CardRecord] = []
    for record in records:
        record = validate_record_images(record, config)
        if record.validation_status == "rejected":
            append_jsonl(failed, record.model_dump())
        else:
            accepted.append(record)
    write_metadata(records, config.dataset_dir)
    print(f"Validated {len(records)} records; {len(accepted)} not rejected.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

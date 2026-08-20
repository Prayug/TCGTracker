#!/usr/bin/env python3
"""Assign train/validation/test/ood splits by physical card, not by image."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from grading_dataset.config import PipelineConfig
from grading_dataset.pipeline.metadata import (
    load_records_from_parquet,
    write_metadata,
    write_split_tables,
)
from grading_dataset.pipeline.splitter import assign_splits


def main() -> int:
    config = PipelineConfig.load()
    meta = config.dataset_dir / "metadata.parquet"
    if not meta.exists():
        print("No metadata.parquet yet. Nothing to split.")
        return 0
    records = load_records_from_parquet(meta)
    records = assign_splits(records, config.splits)
    write_metadata(records, config.dataset_dir)
    written = write_split_tables(records, config.dataset_dir)
    print("Wrote splits:")
    for name, path in written.items():
        print(f"  {name}: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

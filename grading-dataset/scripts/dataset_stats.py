#!/usr/bin/env python3
"""Write dataset_stats.json, charts, and dataset_report.md."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from grading_dataset.config import PipelineConfig
from grading_dataset.pipeline.metadata import load_records_from_parquet
from grading_dataset.pipeline.stats import (
    render_markdown,
    summarize,
    write_charts,
    write_dataset_stats_json,
)
from grading_dataset.schema import CardRecord


def main() -> int:
    config = PipelineConfig.load()
    meta = config.dataset_dir / "metadata.parquet"
    if not meta.exists():
        records: list[CardRecord] = []
    else:
        records = load_records_from_parquet(meta)
    summary = summarize(records)
    write_dataset_stats_json(summary, config.dataset_dir / "dataset_stats.json")
    write_charts(summary, config.reports_dir)
    report = render_markdown(summary, "Graded Pokémon card dataset report")
    if not records:
        report = (
            "# dataset_report.md\n\n"
            "No images have been collected yet. Phase 1 stopped after source "
            "discovery. See `sources_report.md`.\n\n"
            + report
        )
    (ROOT / "dataset_report.md").write_text(report, encoding="utf-8")
    (config.reports_dir / "dataset_report.md").write_text(report, encoding="utf-8")
    print(f"Records: {len(records)}")
    print(f"Wrote {config.dataset_dir / 'dataset_stats.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

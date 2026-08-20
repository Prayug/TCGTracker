#!/usr/bin/env python3
"""Collect images from the approved Hugging Face Hub source."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from grading_dataset.catalog import collection_enabled_sources
from grading_dataset.config import PipelineConfig
from grading_dataset.db import PipelineDB
from grading_dataset.legal import LegalBlock, assert_may_collect
from grading_dataset.logging_utils import log_event, setup_logging
from grading_dataset.pipeline.collector import collect
from grading_dataset.pipeline.postprocess import run_phase4
from grading_dataset.sources import get_adapter


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", default="hf_pacoalberola_psa_images")
    parser.add_argument("--pilot", action="store_true", help="Cap at 100 valid cards per grade")
    parser.add_argument(
        "--i-have-reviewed-sources-report",
        action="store_true",
        help="Required acknowledgement that Phase 1 was reviewed",
    )
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()

    config = PipelineConfig.load()
    logger = setup_logging(config.log_path)

    if not args.i_have_reviewed_sources_report:
        print(
            "Refusing to collect. Read sources_report.md, then re-run with "
            "--i-have-reviewed-sources-report."
        )
        return 2

    enabled = collection_enabled_sources()
    if not enabled:
        print("No source has collection_allowed=true.")
        log_event(logger, event="collect_blocked", reason="no_enabled_sources")
        return 3

    try:
        source = assert_may_collect(args.source, config)
        adapter = get_adapter(source.id)
        adapter.prepare(config)
    except LegalBlock as exc:
        print(str(exc))
        log_event(logger, event="collect_blocked", source=args.source, error=str(exc))
        return 4
    except KeyError as exc:
        print(str(exc))
        return 2

    db = PipelineDB(config.sqlite_path)
    db.upsert_source(source.to_dict())
    log_event(logger, event="collect_start", source=source.id, pilot=args.pilot)
    try:
        records = collect(
            adapter=adapter,
            config=config,
            db=db,
            logger=logger,
            pilot=args.pilot,
            limit=args.limit,
        )
        run_phase4(records, config, pilot=args.pilot)
    except LegalBlock as exc:
        print(str(exc))
        db.log_error(str(exc), source=source.id)
        return 4
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

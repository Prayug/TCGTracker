#!/usr/bin/env python3
"""Write a manual QA HTML sample and record reviewer decisions."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import get_args

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from grading_dataset.config import PipelineConfig
from grading_dataset.db import PipelineDB
from grading_dataset.pipeline.qa import pause_if_source_unreliable, sample_for_review, write_qa_html
from grading_dataset.schema import QaDecision, card_record_from_payload


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--record-decision", nargs=3, metavar=("SAMPLE_ID", "SOURCE", "DECISION"))
    parser.add_argument("--notes", default="")
    args = parser.parse_args()
    config = PipelineConfig.load()
    db = PipelineDB(config.sqlite_path)

    if args.record_decision:
        sample_id, source, decision = args.record_decision
        if decision not in get_args(QaDecision):
            print("Decision must be ACCEPT, WRONG_GRADE, WRONG_CARD, BAD_IMAGE, DUPLICATE, or OTHER")
            return 2
        db.add_qa(sample_id, source, decision, args.notes)
        paused = pause_if_source_unreliable(
            db, source, config.qa.source_error_rate_pause
        )
        print("Recorded", decision, "paused_source" if paused else "ok")
        return 0

    records = [card_record_from_payload(row) for row in db.iter_records()]
    sample = sample_for_review(records, config.qa)
    dest = config.qa_dir / "qa_sample.html"
    write_qa_html(sample, dest)
    print(f"Wrote {dest} ({len(sample)} cards).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

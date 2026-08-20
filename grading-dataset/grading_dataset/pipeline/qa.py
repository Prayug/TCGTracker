"""Manual QA sampling: 20 of every 500 downloads, HTML review queue."""

from __future__ import annotations

import html
import json
import random
from pathlib import Path

from grading_dataset.config import QaConfig
from grading_dataset.db import PipelineDB
from grading_dataset.schema import CardRecord


def maybe_queue_for_qa(
    records_so_far: int,
    record: CardRecord,
    config: QaConfig,
    rng: random.Random | None = None,
) -> bool:
    rng = rng or random.Random()
    if records_so_far == 0 or records_so_far % config.every_n_downloads:
        return False
    return True


def sample_for_review(
    pool: list[CardRecord], config: QaConfig, rng: random.Random | None = None
) -> list[CardRecord]:
    rng = rng or random.Random()
    if len(pool) <= config.sample_size:
        return list(pool)
    return rng.sample(pool, config.sample_size)


def write_qa_html(records: list[CardRecord], dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    cards = []
    for record in records:
        img = record.local_front_path or record.original_front_path
        cards.append(
            f"""
<section class="card">
  <img src="{html.escape(img)}" alt="{html.escape(record.sample_id)}" />
  <pre>{html.escape(json.dumps({
                "sample_id": record.sample_id,
                "grade": record.grade,
                "grade_label": record.grade_label,
                "confidence": record.grade_label_confidence,
                "card_name": record.card_name,
                "set_name": record.set_name,
                "source": record.source,
                "source_url": record.source_url,
                "cert_number": record.cert_number,
                "capture_type": record.capture_type,
            }, indent=2))}</pre>
  <p>Reviewer: ACCEPT | WRONG GRADE | WRONG CARD | BAD IMAGE | DUPLICATE | OTHER</p>
</section>
"""
        )
    dest.write_text(
        """<!doctype html>
<html><head><meta charset="utf-8"><title>QA sample</title>
<style>
body { font-family: sans-serif; background: #111; color: #eee; }
.card { border: 1px solid #333; margin: 1rem 0; padding: 1rem; }
img { max-width: 420px; height: auto; }
pre { white-space: pre-wrap; }
</style></head><body>
<h1>Manual QA sample</h1>
"""
        + "\n".join(cards)
        + "</body></html>",
        encoding="utf-8",
    )
    return dest


def pause_if_source_unreliable(
    db: PipelineDB, source_id: str, threshold: float
) -> bool:
    rate = db.source_qa_error_rate(source_id)
    if rate is None:
        return False
    if rate > threshold:
        db.pause_source(
            source_id,
            f"QA error rate {rate:.2%} exceeded {threshold:.2%}",
        )
        return True
    return False

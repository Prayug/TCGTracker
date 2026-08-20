"""Hugging Face Hub downloads via huggingface_hub (not HTML scraping).

Primary public source: pacoalberola/Poke-Grader-Dataset-Images-PSA
jyesr/pokemon-tcg-grading is gated and is not used.
"""

from __future__ import annotations

import csv
import re
import shutil
import time
from collections import defaultdict
from collections.abc import Iterator
from pathlib import Path

from grading_dataset.config import PipelineConfig
from grading_dataset.db import utc_now
from grading_dataset.legal import LegalBlock, license_allowed
from grading_dataset.schema import CardRecord
from grading_dataset.sources.base import SourceAdapter

REPO_ID = "pacoalberola/Poke-Grader-Dataset-Images-PSA"
PSA_SOURCES = {"ebay_psa", "pwcc_psa"}
HALF_GRADE_RE = re.compile(r"psa\d{1,2}p5", re.IGNORECASE)
FILENAME_GRADE_RE = re.compile(
    r"psa(?:(?P<two>10|0[1-9])|(?P<p0>10|[1-9])p0)(?:[-._]|$)",
    re.IGNORECASE,
)


def parse_integer_grade(raw: str) -> int | None:
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return None
    if abs(value - round(value)) > 0.05:
        return None
    grade = int(round(value))
    if 1 <= grade <= 10:
        return grade
    return None


def filename_psa_grade(filename: str) -> int | None:
    match = FILENAME_GRADE_RE.search(filename)
    if not match:
        return None
    token = match.group("two") or match.group("p0")
    if not token:
        return None
    grade = int(token)
    if 1 <= grade <= 10:
        return grade
    return None


def label_confidence(filename: str, source: str, grade: int) -> str:
    if source not in PSA_SOURCES:
        return "weak"
    if HALF_GRADE_RE.search(filename):
        return "weak"
    file_grade = filename_psa_grade(filename)
    if file_grade is not None and file_grade != grade:
        return "weak"
    return "strong"


def hub_url(filename: str) -> str:
    return (
        "https://huggingface.co/datasets/"
        f"{REPO_ID}/resolve/main/images/{filename}"
    )


def row_to_record(row: dict[str, str], source_id: str) -> CardRecord | None:
    if row.get("source") not in PSA_SOURCES:
        return None
    grade = parse_integer_grade(row.get("overall_grade", ""))
    if grade is None:
        return None
    filename = row.get("filename") or ""
    if not filename:
        return None
    confidence = label_confidence(filename, row["source"], grade)
    if confidence != "strong":
        return None
    stem = Path(filename).stem
    sample_id = "hf_" + stem
    return CardRecord(
        sample_id=sample_id,
        source=source_id,
        source_url=f"https://huggingface.co/datasets/{REPO_ID}",
        source_record_id=filename,
        certification_company="PSA",
        grade=grade,
        grade_label=f"PSA {grade}",
        grade_label_confidence="strong",
        front_image_url=hub_url(filename),
        license="huggingface-hub-public-dataset",
        retrieved_at=utc_now(),
        capture_type="slab",
    )


def round_robin(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    buckets: dict[int, list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        grade = parse_integer_grade(row.get("overall_grade", ""))
        if grade is None:
            continue
        buckets[grade].append(row)
    for grade, items in buckets.items():
        items.sort(
            key=lambda r: (0 if r.get("source") == "pwcc_psa" else 1, r.get("filename", ""))
        )
    out: list[dict[str, str]] = []
    remaining = True
    while remaining:
        remaining = False
        for grade in range(1, 11):
            if buckets[grade]:
                out.append(buckets[grade].pop(0))
                remaining = True
    return out


class HuggingFaceAdapter(SourceAdapter):
    repo_id = REPO_ID

    def iter_candidates(
        self, config: PipelineConfig, *, limit: int | None = None
    ) -> Iterator[CardRecord]:
        if not license_allowed("huggingface-hub-public-dataset", config):
            raise LegalBlock("huggingface-hub-public-dataset is not allow-listed")
        from huggingface_hub import hf_hub_download

        csv_path = hf_hub_download(
            repo_id=self.repo_id,
            repo_type="dataset",
            filename="grades.csv",
        )
        with open(csv_path, encoding="utf-8") as handle:
            rows = list(csv.DictReader(handle))
        ordered = round_robin(rows)
        yielded = 0
        for row in ordered:
            record = row_to_record(row, self.source.id)
            if record is None:
                continue
            yield record
            yielded += 1
            if limit is not None and yielded >= limit:
                return

    def download_front(self, record: CardRecord, dest: Path, *, interval: float) -> Path:
        from huggingface_hub import hf_hub_download
        from huggingface_hub.utils import HfHubHTTPError

        if interval > 0:
            time.sleep(interval)
        try:
            cached = hf_hub_download(
                repo_id=self.repo_id,
                repo_type="dataset",
                filename=f"images/{record.source_record_id}",
            )
        except HfHubHTTPError as exc:
            status = getattr(getattr(exc, "response", None), "status_code", None)
            if status in (401, 403):
                raise LegalBlock(
                    f"Hugging Face returned HTTP {status}. Stopping this source."
                ) from exc
            raise
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(cached, dest)
        return dest

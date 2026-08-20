"""Download, validate, and store records from an approved adapter."""

from __future__ import annotations

import logging

from grading_dataset.config import PipelineConfig
from grading_dataset.db import PipelineDB
from grading_dataset.legal import LegalBlock
from grading_dataset.logging_utils import log_event
from grading_dataset.pipeline.deduplicator import (
    DuplicateIndex,
    check_duplicate,
    perceptual_hash,
    sha256_file,
)
from grading_dataset.pipeline.metadata import append_jsonl, sample_paths, write_metadata
from grading_dataset.pipeline.quota import QuotaTracker
from grading_dataset.pipeline.validator import validate_record_images
from grading_dataset.schema import CardRecord, card_record_from_payload
from grading_dataset.sources.base import SourceAdapter
from grading_dataset.sources.huggingface import HuggingFaceAdapter


def _persist(db: PipelineDB, record: CardRecord) -> None:
    payload = record.model_dump()
    payload["physical_key"] = record.physical_key()
    payload["identity_key"] = record.identity_key()
    db.upsert_record(record.sample_id, record.source, payload)


def collect(
    *,
    adapter: SourceAdapter,
    config: PipelineConfig,
    db: PipelineDB,
    logger: logging.Logger,
    pilot: bool,
    limit: int | None,
) -> list[CardRecord]:
    existing = [card_record_from_payload(row) for row in db.iter_records()]
    quota = QuotaTracker(config.quota)
    quota.load(existing)
    index = DuplicateIndex()
    for rec in existing:
        if rec.sha256_front:
            index.observe_hash(rec.sha256_front)
        if rec.cert_number:
            index.observe_cert(rec.certification_company, rec.cert_number)
        if rec.phash_front:
            index.observe_phash(rec.phash_front, rec.sample_id)

    failed_path = config.dataset_dir / "failed_records.jsonl"
    dup_path = config.dataset_dir / "duplicates.jsonl"
    processed = 0
    downloaded = 0
    interval = config.rate_limit.hub_interval_seconds
    cap = config.quota.pilot_per_grade if pilot else config.quota.target_per_grade

    for candidate in adapter.iter_candidates(config, limit=limit):
        processed += 1
        if db.record_exists(candidate.sample_id):
            continue
        if db.source_paused(candidate.source):
            raise LegalBlock(f"Source {candidate.source} is paused")
        ok, reason = quota.would_accept(candidate, pilot=pilot)
        if not ok:
            if reason.endswith("quota_met") and all(
                quota.grade_counts[g] >= cap for g in range(1, 11)
            ):
                break
            continue
        paths = sample_paths(config.dataset_dir, candidate.sample_id, candidate.grade)
        dest = paths["original_front"]
        try:
            if isinstance(adapter, HuggingFaceAdapter):
                adapter.download_front(candidate, dest, interval=interval)
            else:
                raise LegalBlock(f"No download path for adapter {type(adapter)}")
        except LegalBlock:
            db.pause_source(candidate.source, "hub HTTP 401/403")
            raise
        except Exception as exc:  # noqa: BLE001
            db.log_error(str(exc), source=candidate.source, url=candidate.front_image_url)
            log_event(
                logger,
                event="download_error",
                sample_id=candidate.sample_id,
                error=str(exc),
            )
            candidate.validation_status = "rejected"
            candidate.rejection_reason = f"download_error:{exc}"
            append_jsonl(failed_path, candidate.model_dump())
            _persist(db, candidate)
            continue

        downloaded += 1
        candidate.local_front_path = str(dest)
        candidate.original_front_path = str(dest)
        candidate.sha256_front = sha256_file(dest)
        try:
            candidate.phash_front = perceptual_hash(dest)
        except Exception:
            candidate.phash_front = ""
        db.mark_download(
            candidate.sample_id,
            candidate.front_image_url,
            local_path=str(dest),
            http_status=200,
            sha256=candidate.sha256_front,
            completed=True,
        )
        dup = check_duplicate(candidate, index)
        if dup:
            candidate.validation_status = "duplicate"
            candidate.rejection_reason = dup
            append_jsonl(dup_path, candidate.model_dump())
            _persist(db, candidate)
            log_event(
                logger,
                event="duplicate",
                sample_id=candidate.sample_id,
                grade=candidate.grade,
                reason=dup,
            )
            continue
        candidate = validate_record_images(candidate, config)
        if candidate.validation_status == "rejected":
            append_jsonl(failed_path, candidate.model_dump())
            _persist(db, candidate)
            log_event(
                logger,
                event="rejected",
                sample_id=candidate.sample_id,
                grade=candidate.grade,
                reason=candidate.rejection_reason,
            )
            continue
        if candidate.validation_status == "accepted":
            quota.commit(candidate)
        _persist(db, candidate)
        log_event(
            logger,
            event="accepted" if candidate.validation_status == "accepted" else candidate.validation_status,
            sample_id=candidate.sample_id,
            grade=candidate.grade,
            source=candidate.source,
        )
        if downloaded % 25 == 0:
            table = {g: quota.grade_counts[g] for g in range(1, 11)}
            print(f"downloaded={downloaded} accepted_by_grade={table}")
        if all(quota.grade_counts[g] >= cap for g in range(1, 11)):
            break

    records = [card_record_from_payload(row) for row in db.iter_records()]
    write_metadata(records, config.dataset_dir)
    print(
        f"Collection pass done. processed={processed} new_downloads={downloaded} "
        f"accepted={dict(quota.grade_counts)}"
    )
    return records

"""Phase 4 cleaning: crop, splits, stats, QA sample, pilot report."""

from __future__ import annotations

from pathlib import Path

from grading_dataset.config import PipelineConfig, ROOT
from grading_dataset.pipeline.cropper import process_image
from grading_dataset.pipeline.metadata import sample_paths, write_metadata, write_split_tables
from grading_dataset.pipeline.qa import sample_for_review, write_qa_html
from grading_dataset.pipeline.splitter import assign_splits
from grading_dataset.pipeline.stats import (
    render_markdown,
    summarize,
    write_charts,
    write_dataset_stats_json,
)
from grading_dataset.schema import CardRecord, training_eligible


def run_phase4(records: list[CardRecord], config: PipelineConfig, *, pilot: bool) -> dict:
    for record in records:
        if not record.local_front_path:
            continue
        src = Path(record.local_front_path)
        if not src.exists():
            continue
        paths = sample_paths(config.dataset_dir, record.sample_id, record.grade)
        info = process_image(src, paths["cropped_front"], paths["rectified_front"])
        if info["cropped_written"]:
            record.cropped_front_path = str(paths["cropped_front"])
        if info["rectified_written"]:
            record.rectified_front_path = str(paths["rectified_front"])
        record.quality.card_crop_confidence = info["card_crop_confidence"]
        record.quality.card_coverage = info["card_coverage"]
        record.quality.perspective_angle_deg = info["perspective_angle_deg"]
    records = assign_splits(records, config.splits)
    write_metadata(records, config.dataset_dir)
    write_split_tables(records, config.dataset_dir)
    summary = summarize(records)
    write_dataset_stats_json(summary, config.dataset_dir / "dataset_stats.json")
    write_charts(summary, config.reports_dir)
    title = "Pilot dataset report" if pilot else "Graded Pokémon card dataset report"
    report = render_markdown(summary, title)
    notes = _limitations(records, summary)
    report = notes + "\n" + report
    dest = ROOT / ("pilot_report.md" if pilot else "dataset_report.md")
    dest.write_text(report, encoding="utf-8")
    (config.reports_dir / dest.name).write_text(report, encoding="utf-8")
    qa_pool = [r for r in records if training_eligible(r)]
    write_qa_html(sample_for_review(qa_pool, config.qa), config.qa_dir / "qa_sample.html")
    return summary


def _limitations(records: list[CardRecord], summary: dict) -> str:
    n_fb = sum(1 for r in records if r.has_front and r.has_back)
    return f"""# Pilot notes

**Source:** Hugging Face `pacoalberola/Poke-Grader-Dataset-Images-PSA` via the official Hub file API (`huggingface_hub`). No eBay/PSA/Collectors HTML scraping.

**Labels:** PSA-only rows (`ebay_psa`, `pwcc_psa`) where the CSV integer grade agrees with the filename token. Confidence is `strong`, not PSA-cert `authoritative`. Half-grades and CGC/BGS/ACE rows were skipped.

**Images:** Marketplace slab photos. Typical shortest side ~300–480 px (below the original 500 px preference). Originals were not upscaled. Front/back pairs available: {n_fb}. `capture_type=slab`.

**Balance:** Grades 1–2 are scarce in this dump (about 60–66 PSA rows before filters). Quota is 100/grade where the source allows.

**License:** No SPDX on the Hub card. Logged as `huggingface-hub-public-dataset`. Treat as internal research; do not republish the images.

"""

"""Parquet / JSONL metadata writers and dataset folder layout."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from grading_dataset.schema import CardRecord, card_record_from_payload, record_to_row


def grade_dir(dataset_dir: Path, grade: int | None) -> Path:
    label = f"grade_{grade}" if grade is not None else "grade_unknown"
    path = dataset_dir / label
    path.mkdir(parents=True, exist_ok=True)
    return path


def sample_paths(dataset_dir: Path, sample_id: str, grade: int | None) -> dict[str, Path]:
    folder = grade_dir(dataset_dir, grade)
    return {
        "original_front": folder / f"{sample_id}_original_front.jpg",
        "original_back": folder / f"{sample_id}_original_back.jpg",
        "cropped_front": folder / f"{sample_id}_cropped_front.jpg",
        "cropped_back": folder / f"{sample_id}_cropped_back.jpg",
        "rectified_front": folder / f"{sample_id}_rectified_front.jpg",
        "rectified_back": folder / f"{sample_id}_rectified_back.jpg",
    }


def write_metadata(records: list[CardRecord], dataset_dir: Path) -> Path:
    rows = [record_to_row(r) for r in records]
    frame = pd.DataFrame(rows)
    dest = dataset_dir / "metadata.parquet"
    dataset_dir.mkdir(parents=True, exist_ok=True)
    frame.to_parquet(dest, index=False)
    return dest


def write_split_tables(records: list[CardRecord], dataset_dir: Path) -> dict[str, Path]:
    dataset_dir.mkdir(parents=True, exist_ok=True)
    by_split: dict[str, list[CardRecord]] = {
        "train": [],
        "validation": [],
        "test": [],
        "ood_test": [],
    }
    for record in records:
        if record.split in by_split:
            by_split[record.split].append(record)
    written: dict[str, Path] = {}
    for name, subset in by_split.items():
        dest = dataset_dir / f"{name}.parquet"
        pd.DataFrame([record_to_row(r) for r in subset]).to_parquet(dest, index=False)
        written[name] = dest
    return written


def parquet_row_to_record(row: dict) -> dict:
    return card_record_from_payload(row).model_dump()


def load_records_from_parquet(path: Path) -> list[CardRecord]:
    frame = pd.read_parquet(path)
    return [card_record_from_payload(row) for row in frame.to_dict(orient="records")]


def append_jsonl(path: Path, row: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(row, ensure_ascii=False) + "\n")

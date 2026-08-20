"""Dataset analysis tables, charts, and Markdown reports."""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

from grading_dataset.schema import CardRecord, training_eligible


def summarize(records: list[CardRecord]) -> dict:
    by_grade: dict[int, dict[str, int]] = {
        g: {"valid": 0, "front_back": 0, "front_only": 0, "rejected": 0, "weak": 0}
        for g in range(1, 11)
    }
    rejected = 0
    duplicates = 0
    source_counts: Counter[str] = Counter()
    source_rejected: Counter[str] = Counter()
    years: Counter[str] = Counter()
    sets: Counter[str] = Counter()
    languages: Counter[str] = Counter()
    identities: Counter[str] = Counter()
    resolutions: list[int] = []
    capture: Counter[str] = Counter()

    for record in records:
        source_counts[record.source] += 1
        capture[record.capture_type] += 1
        if record.year:
            years[record.year] += 1
        if record.set_name:
            sets[record.set_name] += 1
        if record.language:
            languages[record.language] += 1
        if record.identity_key().strip("|"):
            identities[record.identity_key()] += 1
        if record.quality.shortest_side:
            resolutions.append(record.quality.shortest_side)
        elif record.image_width and record.image_height:
            resolutions.append(min(record.image_width, record.image_height))
        grade = record.grade if record.grade in by_grade else None
        if record.validation_status == "duplicate":
            duplicates += 1
        if record.validation_status == "rejected":
            rejected += 1
            source_rejected[record.source] += 1
            if grade:
                by_grade[grade]["rejected"] += 1
            continue
        if record.validation_status == "weak_holdout":
            if grade:
                by_grade[grade]["weak"] += 1
            continue
        if training_eligible(record) and grade:
            by_grade[grade]["valid"] += 1
            if record.has_front and record.has_back:
                by_grade[grade]["front_back"] += 1
            elif record.has_front:
                by_grade[grade]["front_only"] += 1

    source_error_rate = {
        src: (source_rejected[src] / source_counts[src]) if source_counts[src] else 0.0
        for src in source_counts
    }
    valid_counts = [by_grade[g]["valid"] for g in range(1, 11)]
    imbalance = max(valid_counts) / max(1, min(c or 0 for c in valid_counts) or 1)

    return {
        "n_records": len(records),
        "by_grade": by_grade,
        "rejected": rejected,
        "duplicates": duplicates,
        "source_counts": dict(source_counts),
        "source_error_rate": source_error_rate,
        "years": dict(years.most_common(30)),
        "sets": dict(sets.most_common(30)),
        "languages": dict(languages),
        "top_identities": dict(identities.most_common(30)),
        "avg_shortest_side": sum(resolutions) / len(resolutions) if resolutions else 0,
        "capture_type": dict(capture),
        "grade_imbalance_ratio": imbalance,
    }


def write_charts(summary: dict, reports_dir: Path) -> list[Path]:
    reports_dir.mkdir(parents=True, exist_ok=True)
    paths: list[Path] = []
    grades = list(range(1, 11))
    valid = [summary["by_grade"][g]["valid"] for g in grades]
    fig, ax = plt.subplots(figsize=(8, 4))
    ax.bar([str(g) for g in grades], valid, color="#1f6feb")
    ax.set_title("Valid examples per PSA grade")
    ax.set_xlabel("Grade")
    ax.set_ylabel("Count")
    dest = reports_dir / "chart_grade_counts.png"
    fig.tight_layout()
    fig.savefig(dest, dpi=140)
    plt.close(fig)
    paths.append(dest)

    if summary["source_counts"]:
        fig, ax = plt.subplots(figsize=(8, 4))
        items = list(summary["source_counts"].items())
        ax.barh([k for k, _ in items], [v for _, v in items])
        ax.set_title("Records by source")
        dest = reports_dir / "chart_sources.png"
        fig.tight_layout()
        fig.savefig(dest, dpi=140)
        plt.close(fig)
        paths.append(dest)
    return paths


def render_markdown(summary: dict, title: str) -> str:
    lines = [
        f"# {title}",
        "",
        f"Total records: **{summary['n_records']}**",
        "",
        "## Grade table",
        "",
        "| Grade | Valid examples | Front+Back | Front only | Rejected | Weak holdout |",
        "| ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for grade in range(1, 11):
        row = summary["by_grade"][grade]
        lines.append(
            f"| {grade} | {row['valid']} | {row['front_back']} | {row['front_only']} | {row['rejected']} | {row['weak']} |"
        )
    lines += [
        "",
        f"- Rejected images: {summary['rejected']}",
        f"- Duplicates removed: {summary['duplicates']}",
        f"- Average shortest side (px): {summary['avg_shortest_side']:.1f}",
        f"- Grade imbalance (max/min valid): {summary['grade_imbalance_ratio']:.2f}",
        "",
        "## Capture type",
        "",
        "```",
        str(summary["capture_type"]),
        "```",
        "",
        "## Samples by source",
        "",
        "```",
        str(summary["source_counts"]),
        "```",
        "",
        "## Source error rate (rejected / all)",
        "",
        "```",
        str(summary["source_error_rate"]),
        "```",
        "",
        "## Year / set / language / identity (top)",
        "",
        f"- years: {summary['years']}",
        f"- sets: {summary['sets']}",
        f"- languages: {summary['languages']}",
        f"- identities: {summary['top_identities']}",
        "",
    ]
    return "\n".join(lines)


def write_dataset_stats_json(summary: dict, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(summary, indent=2, default=str), encoding="utf-8")

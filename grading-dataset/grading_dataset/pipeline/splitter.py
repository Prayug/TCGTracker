"""Leakage-safe splits by physical card, plus optional OOD set holdout."""

from __future__ import annotations

import hashlib
from collections import defaultdict

from grading_dataset.config import SplitConfig
from grading_dataset.schema import CardRecord, SplitName, training_eligible


def _stable_unit(key: str, seed: int) -> float:
    digest = hashlib.sha256(f"{seed}:{key}".encode()).hexdigest()
    return int(digest[:12], 16) / float(16**12)


def assign_splits(
    records: list[CardRecord], config: SplitConfig
) -> list[CardRecord]:
    train_end = config.train
    val_end = config.train + config.validation
    ood_sets = {item.strip().lower() for item in config.ood_holdout_sets if item.strip()}

    groups: dict[str, list[CardRecord]] = defaultdict(list)
    for record in records:
        groups[record.physical_key()].append(record)

    for physical_key, group in groups.items():
        representative = group[0]
        set_name = (representative.set_name or "").strip().lower()
        if ood_sets and set_name and set_name in ood_sets:
            split: SplitName = "ood_test"
        else:
            unit = _stable_unit(physical_key, config.seed)
            if unit < train_end:
                split = "train"
            elif unit < val_end:
                split = "validation"
            else:
                split = "test"
        for record in group:
            record.split = split
            # Weak / rejected records keep their status; split is still assigned
            # so all versions of a physical card stay together.
            _ = training_eligible(record)
    return records

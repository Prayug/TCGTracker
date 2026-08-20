"""Per-grade quotas and identity diversity caps."""

from __future__ import annotations

from collections import Counter, defaultdict

from grading_dataset.config import QuotaConfig
from grading_dataset.schema import CardRecord, training_eligible


class QuotaTracker:
    def __init__(self, config: QuotaConfig) -> None:
        self.config = config
        self.grade_counts: Counter[int] = Counter()
        self.identity_counts: dict[int, Counter[str]] = defaultdict(Counter)

    def load(self, records: list[CardRecord]) -> None:
        for record in records:
            if training_eligible(record) and record.grade is not None:
                self.grade_counts[record.grade] += 1
                self.identity_counts[record.grade][record.identity_key()] += 1

    def would_accept(self, record: CardRecord, *, pilot: bool = False) -> tuple[bool, str]:
        if record.grade is None:
            return False, "missing_grade"
        cap = self.config.pilot_per_grade if pilot else self.config.target_per_grade
        if self.grade_counts[record.grade] >= cap:
            return False, f"grade_{record.grade}_quota_met"
        identity = record.identity_key()
        named = any(part.strip() for part in identity.split("|"))
        if named:
            current = self.identity_counts[record.grade][identity]
            projected = current + 1
            denom = max(1, self.grade_counts[record.grade] + 1)
            if projected / denom > self.config.max_identity_fraction_per_grade and current >= 2:
                return False, "identity_overrepresented"
        return True, "ok"

    def commit(self, record: CardRecord) -> None:
        if record.grade is None:
            return
        self.grade_counts[record.grade] += 1
        self.identity_counts[record.grade][record.identity_key()] += 1

    def live_table(self) -> list[dict]:
        rows = []
        for grade in range(1, 11):
            rows.append(
                {
                    "grade": grade,
                    "valid_examples": self.grade_counts[grade],
                    "quota": self.config.target_per_grade,
                }
            )
        return rows

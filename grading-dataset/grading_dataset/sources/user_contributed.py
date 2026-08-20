"""Future user-contributed raw photos with later PSA outcomes."""

from __future__ import annotations

import json
import os
from collections.abc import Iterator
from pathlib import Path

from grading_dataset.config import PipelineConfig
from grading_dataset.legal import LegalBlock
from grading_dataset.schema import CardRecord, UserContributionFields
from grading_dataset.sources.base import SourceAdapter


class UserContributedAdapter(SourceAdapter):
    def iter_candidates(
        self, config: PipelineConfig, *, limit: int | None = None
    ) -> Iterator[CardRecord]:
        inbox = Path(os.environ.get("USER_CONTRIB_INBOX", ""))
        if not inbox.exists():
            raise LegalBlock(
                "User contribution intake is not enabled. Set USER_CONTRIB_INBOX "
                "to a JSONL drop folder after contributor terms exist."
            )
        count = 0
        for path in sorted(inbox.glob("*.jsonl")):
            for line in path.read_text(encoding="utf-8").splitlines():
                if not line.strip():
                    continue
                payload = json.loads(line)
                payload.setdefault("source", self.source.id)
                payload.setdefault("capture_type", "raw")
                payload.setdefault("license", "contributor-agreement")
                if "user_contribution" not in payload:
                    payload["user_contribution"] = UserContributionFields().model_dump()
                yield CardRecord.model_validate(payload)
                count += 1
                if limit is not None and count >= limit:
                    return

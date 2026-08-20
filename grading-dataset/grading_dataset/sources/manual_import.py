"""Offline import of an archive that already has a documented license."""

from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path

from grading_dataset.config import PipelineConfig
from grading_dataset.legal import LegalBlock, license_allowed
from grading_dataset.schema import CardRecord
from grading_dataset.sources.base import SourceAdapter


class ManualImportAdapter(SourceAdapter):
    def iter_candidates(
        self, config: PipelineConfig, *, limit: int | None = None
    ) -> Iterator[CardRecord]:
        manifest = Path(os_environ_manifest())
        if not manifest.exists():
            raise LegalBlock(
                "Manual import requires MANUAL_IMPORT_MANIFEST pointing at a JSONL "
                "file of CardRecord objects plus a license field on every row."
            )
        count = 0
        with manifest.open(encoding="utf-8") as handle:
            for line in handle:
                if not line.strip():
                    continue
                payload = json.loads(line)
                license_id = payload.get("license") or ""
                if not license_allowed(license_id, config):
                    raise LegalBlock(
                        f"Refusing manual import row {payload.get('sample_id')}: "
                        f"license {license_id!r} is not allow-listed."
                    )
                yield CardRecord.model_validate(payload)
                count += 1
                if limit is not None and count >= limit:
                    return


def os_environ_manifest() -> str:
    import os

    return os.environ.get("MANUAL_IMPORT_MANIFEST", "")

"""Official PSA Public API adapter.

Disabled until:
1. collection_allowed is true on the catalog entry
2. The operator has accepted the PSA API End User Agreement
3. PSA_ML_USE_CONFIRMED=yes is set, meaning the EUA (or a written license)
   allows this training use
4. Credentials are present

Lookup is by cert number only. This adapter will not scrape psacard.com HTML
and will not guess cert numbers by brute force.
"""

from __future__ import annotations

import os
from collections.abc import Iterator

from grading_dataset.config import PipelineConfig
from grading_dataset.legal import LegalBlock
from grading_dataset.schema import CardRecord
from grading_dataset.sources.base import SourceAdapter


class PsaApiAdapter(SourceAdapter):
    def iter_candidates(
        self, config: PipelineConfig, *, limit: int | None = None
    ) -> Iterator[CardRecord]:
        if os.environ.get("PSA_ML_USE_CONFIRMED", "").lower() not in {"yes", "true", "1"}:
            raise LegalBlock(
                "PSA API collection is blocked until PSA_ML_USE_CONFIRMED=yes. "
                "Set that only after you have read the PSA API End User Agreement "
                "and confirmed it permits storing images for this ML/research use, "
                "or after Collectors grants a written license. "
                "Do not scrape psacard.com."
            )
        if not os.environ.get("PSA_API_TOKEN"):
            raise LegalBlock("PSA_API_TOKEN is missing.")
        cert_file = os.environ.get("PSA_CERT_LIST")
        if not cert_file:
            raise LegalBlock(
                "PSA public API cannot enumerate certs. Provide PSA_CERT_LIST "
                "as a text file of cert numbers you are allowed to look up."
            )
        raise LegalBlock(
            "PSA adapter scaffolding is present but collection_allowed remains "
            "false on the catalog entry. Flip it only after legal review."
        )

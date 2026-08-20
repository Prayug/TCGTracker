"""Source adapters. Each adapter is isolated from processing."""

from __future__ import annotations

from grading_dataset.catalog import SOURCES, SourceRecord, source_by_id
from grading_dataset.sources.base import SourceAdapter
from grading_dataset.sources.huggingface import HuggingFaceAdapter
from grading_dataset.sources.manual_import import ManualImportAdapter
from grading_dataset.sources.psa_api import PsaApiAdapter
from grading_dataset.sources.user_contributed import UserContributedAdapter

ADAPTERS: dict[str, type[SourceAdapter]] = {
    "hf_jyesr_pokemon_tcg_grading": HuggingFaceAdapter,
    "hf_pacoalberola_psa_images": HuggingFaceAdapter,
    "hf_lding101_pokemon_card_grades": HuggingFaceAdapter,
    "psa_public_api": PsaApiAdapter,
    "psa_written_research_license": PsaApiAdapter,
    "manual_licensed_import": ManualImportAdapter,
    "user_contributed_raw_psa": UserContributedAdapter,
}


def get_adapter(source_id: str) -> SourceAdapter:
    source = source_by_id(source_id)
    cls = ADAPTERS.get(source_id)
    if cls is None:
        raise KeyError(
            f"No adapter implemented for {source_id}. "
            "Add a module under sources/ rather than coupling scrape logic to processing."
        )
    return cls(source)


def all_catalog_sources() -> tuple[SourceRecord, ...]:
    return SOURCES

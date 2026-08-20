"""Base source adapter. Adapters must not scrape prohibited sites."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Iterator

from grading_dataset.catalog import SourceRecord
from grading_dataset.config import PipelineConfig
from grading_dataset.legal import assert_may_collect
from grading_dataset.schema import CardRecord


class SourceAdapter(ABC):
    def __init__(self, source: SourceRecord) -> None:
        self.source = source

    def prepare(self, config: PipelineConfig) -> None:
        assert_may_collect(self.source.id, config)

    @abstractmethod
    def iter_candidates(
        self, config: PipelineConfig, *, limit: int | None = None
    ) -> Iterator[CardRecord]:
        """Yield metadata-only records. Downloader fetches bytes later."""

"""Legal gate tests."""

from grading_dataset.catalog import collection_enabled_sources, source_by_id
from grading_dataset.config import PipelineConfig
from grading_dataset.legal import LegalBlock, assert_may_collect, license_allowed, review_source


def test_hf_psa_images_is_the_enabled_source():
    enabled = collection_enabled_sources()
    assert [s.id for s in enabled] == ["hf_pacoalberola_psa_images"]


def test_psa_website_is_prohibited():
    source = source_by_id("psa_collectors_website")
    assert source.scraping_permission == "prohibited"
    assert source.collection_allowed is False


def test_ebay_html_is_prohibited():
    source = source_by_id("ebay_html")
    assert source.scraping_permission == "prohibited"


def test_assert_may_collect_blocks_psa_api():
    config = PipelineConfig()
    config.collection_enabled = True
    try:
        assert_may_collect("psa_public_api", config)
        raise AssertionError("should have blocked")
    except LegalBlock as exc:
        assert "collection_allowed" in str(exc)


def test_assert_may_collect_allows_hf_when_enabled():
    config = PipelineConfig.load()
    source = assert_may_collect("hf_pacoalberola_psa_images", config)
    assert source.scraping_permission == "official_dataset_download"


def test_empty_license_refused():
    config = PipelineConfig()
    assert license_allowed("", config) is False
    assert license_allowed("unknown", config) is False
    assert license_allowed("cc-by-4.0", config) is True
    assert license_allowed("huggingface-hub-public-dataset", config) is True


def test_review_lists_reasons_for_skipped_source():
    config = PipelineConfig()
    source = source_by_id("ebay_html")
    review = review_source(source, config)
    assert review.allowed is False
    assert any("prohibited" in r or "collection_allowed" in r for r in review.reasons)

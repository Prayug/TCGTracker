"""Split leakage tests: one physical card, one split."""

from grading_dataset.config import SplitConfig
from grading_dataset.pipeline.splitter import assign_splits
from grading_dataset.schema import CardRecord


def _card(**kwargs) -> CardRecord:
    base = dict(
        sample_id="x",
        source="test",
        certification_company="PSA",
        grade=8,
        grade_label_confidence="authoritative",
        validation_status="accepted",
        capture_type="slab",
    )
    base.update(kwargs)
    return CardRecord.model_validate(base)


def test_front_back_crop_share_split():
    records = [
        _card(sample_id="a_front", cert_number="12345678", local_front_path="f.jpg"),
        _card(sample_id="a_back", cert_number="12345678", local_back_path="b.jpg"),
        _card(sample_id="a_crop", cert_number="12345678", cropped_front_path="c.jpg"),
    ]
    assign_splits(records, SplitConfig(seed=7))
    splits = {r.split for r in records}
    assert len(splits) == 1
    assert records[0].split != "unassigned"


def test_different_certs_can_differ():
    records = [
        _card(sample_id="a", cert_number="111", set_name="Base"),
        _card(sample_id="b", cert_number="222", set_name="Base"),
        _card(sample_id="c", cert_number="333", set_name="Base"),
        _card(sample_id="d", cert_number="444", set_name="Base"),
        _card(sample_id="e", cert_number="555", set_name="Base"),
        _card(sample_id="f", cert_number="666", set_name="Jungle"),
        _card(sample_id="g", cert_number="777", set_name="Jungle"),
        _card(sample_id="h", cert_number="888", set_name="Fossil"),
        _card(sample_id="i", cert_number="999", set_name="Fossil"),
        _card(sample_id="j", cert_number="1000", set_name="Team Rocket"),
    ]
    assign_splits(records, SplitConfig(seed=1))
    assert {r.split for r in records} <= {"train", "validation", "test", "ood_test"}


def test_ood_holdout_by_set():
    records = [
        _card(sample_id="a", cert_number="111", set_name="Hidden Fates"),
        _card(sample_id="a2", cert_number="111", set_name="Hidden Fates"),
        _card(sample_id="b", cert_number="222", set_name="Base"),
    ]
    assign_splits(records, SplitConfig(ood_holdout_sets=["Hidden Fates"], seed=1))
    hidden = [r for r in records if r.cert_number == "111"]
    assert all(r.split == "ood_test" for r in hidden)
    assert records[2].split != "ood_test"

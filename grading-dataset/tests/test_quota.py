from grading_dataset.config import QuotaConfig
from grading_dataset.pipeline.quota import QuotaTracker
from grading_dataset.schema import CardRecord


def test_grade_quota_stops_overrepresented_grade():
    tracker = QuotaTracker(QuotaConfig(target_per_grade=2, max_identity_fraction_per_grade=1.0))
    a = CardRecord(
        sample_id="a",
        source="t",
        grade=10,
        grade_label_confidence="authoritative",
        validation_status="accepted",
        card_name="A",
        set_name="S",
        card_number="1",
    )
    b = CardRecord(
        sample_id="b",
        source="t",
        grade=10,
        grade_label_confidence="authoritative",
        validation_status="accepted",
        card_name="B",
        set_name="S",
        card_number="2",
    )
    c = CardRecord(
        sample_id="c",
        source="t",
        grade=10,
        grade_label_confidence="authoritative",
        validation_status="accepted",
        card_name="C",
        set_name="S",
        card_number="3",
    )
    assert tracker.would_accept(a)[0]
    tracker.commit(a)
    assert tracker.would_accept(b)[0]
    tracker.commit(b)
    ok, reason = tracker.would_accept(c)
    assert ok is False
    assert "quota_met" in reason


def test_identity_cap():
    tracker = QuotaTracker(QuotaConfig(target_per_grade=100, max_identity_fraction_per_grade=0.05))
    for i in range(3):
        rec = CardRecord(
            sample_id=f"z{i}",
            source="t",
            grade=1,
            grade_label_confidence="authoritative",
            validation_status="accepted",
            card_name="Charizard",
            set_name="Base",
            card_number="4",
        )
        ok, reason = tracker.would_accept(rec)
        if i < 2:
            assert ok, reason
            tracker.commit(rec)
        else:
            assert ok is False
            assert reason == "identity_overrepresented"


def test_unnamed_cards_are_not_identity_capped():
    tracker = QuotaTracker(QuotaConfig(target_per_grade=100, max_identity_fraction_per_grade=0.05))
    for i in range(10):
        rec = CardRecord(sample_id=f"u{i}", source="t", grade=3)
        ok, reason = tracker.would_accept(rec)
        assert ok, reason
        tracker.commit(rec)
    assert tracker.grade_counts[3] == 10

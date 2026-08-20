from grading_dataset.schema import CardRecord, card_record_from_payload, record_to_row


def test_card_record_from_nested_and_flat_payload():
    record = CardRecord(
        sample_id="hf_pwcc-psa9p0-abc",
        source="hf_pacoalberola_psa_images",
        grade=9,
        image_width=468,
        image_height=796,
        quality={"image_width": 468, "image_height": 796, "shortest_side": 468},
    )
    nested = card_record_from_payload(record.model_dump())
    assert nested.quality.shortest_side == 468

    flat = record_to_row(record)
    flat["quality_shortest_side"] = 0
    flat["quality_image_width"] = 0
    flat["quality_image_height"] = 0
    restored = card_record_from_payload(flat)
    assert restored.quality.shortest_side == 468
    assert restored.quality.image_width == 468
    assert restored.grade == 9

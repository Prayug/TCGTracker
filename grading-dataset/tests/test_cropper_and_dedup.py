from pathlib import Path

import numpy as np
from PIL import Image

from grading_dataset.pipeline.cropper import detect_card_quad, process_image
from grading_dataset.pipeline.deduplicator import DuplicateIndex, check_duplicate, sha256_file
from grading_dataset.schema import CardRecord, UserContributionFields


def test_detects_light_rectangle_on_dark_background():
    arr = np.zeros((400, 300, 3), dtype=np.uint8)
    arr[40:360, 40:260] = 220
    import cv2

    bgr = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
    corners, conf = detect_card_quad(bgr)
    assert corners is not None
    assert conf > 0.2


def test_crop_writes_new_files_not_original(tmp_path: Path):
    img = Image.new("RGB", (300, 420), (10, 10, 10))
    # draw a light card
    px = img.load()
    for y in range(40, 380):
        for x in range(40, 260):
            px[x, y] = (200, 200, 200)
    src = tmp_path / "original_front.jpg"
    img.save(src)
    cropped = tmp_path / "cropped_front.jpg"
    rectified = tmp_path / "rectified_front.jpg"
    process_image(src, cropped, rectified)
    assert src.exists()
    original_hash = sha256_file(src)
    # original still same size/path
    assert Image.open(src).size == (300, 420)
    assert sha256_file(src) == original_hash


def test_user_contribution_schema_defaults():
    fields = UserContributionFields()
    assert fields.raw_front_images == []
    assert fields.submitted_to_psa is False
    assert fields.actual_psa_grade is None


def test_duplicate_cert():
    index = DuplicateIndex()
    a = CardRecord(sample_id="1", source="a", cert_number="999", certification_company="PSA")
    b = CardRecord(sample_id="2", source="b", cert_number="999", certification_company="PSA")
    assert check_duplicate(a, index) is None
    assert check_duplicate(b, index) == "duplicate_cert:999"

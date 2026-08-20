from grading_dataset.sources.huggingface import (
    filename_psa_grade,
    label_confidence,
    parse_integer_grade,
    row_to_record,
    round_robin,
)


def test_parse_integer_grade():
    assert parse_integer_grade("10.0") == 10
    assert parse_integer_grade("7") == 7
    assert parse_integer_grade("4.5") is None
    assert parse_integer_grade("nope") is None


def test_filename_grades():
    assert filename_psa_grade("ebay-psa10-54d50488c8.jpg") == 10
    assert filename_psa_grade("ebay-psa09-d49d596339.jpg") == 9
    assert filename_psa_grade("ebay-psa01-dd2b74777a.jpg") == 1
    assert filename_psa_grade("pwcc-psa7p0-18829605e0.jpg") == 7
    assert filename_psa_grade("pwcc-psa10p0-55f03b30b6.jpg") == 10
    assert filename_psa_grade("ebay-psa8p5-cecc23afa5.jpg") is None


def test_row_skips_non_psa_and_half_grades():
    assert (
        row_to_record(
            {
                "filename": "ebay-cgc4p5-x.jpg",
                "overall_grade": "4.0",
                "source": "ebay_cgc",
            },
            "hf_pacoalberola_psa_images",
        )
        is None
    )
    assert (
        row_to_record(
            {
                "filename": "ebay-psa8p5-cecc23afa5.jpg",
                "overall_grade": "8.0",
                "source": "ebay_psa",
            },
            "hf_pacoalberola_psa_images",
        )
        is None
    )
    rec = row_to_record(
        {
            "filename": "pwcc-psa9p0-b04b1d833f.jpg",
            "overall_grade": "9.0",
            "source": "pwcc_psa",
        },
        "hf_pacoalberola_psa_images",
    )
    assert rec is not None
    assert rec.grade == 9
    assert rec.grade_label_confidence == "strong"
    assert rec.capture_type == "slab"


def test_round_robin_prefers_pwcc_and_balances_grades():
    rows = [
        {"filename": "ebay-psa08-a.jpg", "overall_grade": "8.0", "source": "ebay_psa"},
        {"filename": "pwcc-psa8p0-b.jpg", "overall_grade": "8.0", "source": "pwcc_psa"},
        {"filename": "ebay-psa01-c.jpg", "overall_grade": "1.0", "source": "ebay_psa"},
    ]
    ordered = round_robin(rows)
    assert parse_integer_grade(ordered[0]["overall_grade"]) == 1
    eights = [r for r in ordered if r["overall_grade"].startswith("8")]
    assert eights[0]["source"] == "pwcc_psa"


def test_label_confidence():
    assert label_confidence("ebay-psa10-x.jpg", "ebay_psa", 10) == "strong"
    assert label_confidence("ebay-psa8p5-x.jpg", "ebay_psa", 8) == "weak"
    assert label_confidence("ebay-psa10-x.jpg", "ebay_cgc", 10) == "weak"

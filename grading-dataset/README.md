# Pokémon graded-card dataset pipeline

Production-oriented **collection and processing** pipeline for a balanced PSA 1–10 Pokémon card image dataset.

**Implemented source:** Hugging Face Hub dataset [`pacoalberola/Poke-Grader-Dataset-Images-PSA`](https://huggingface.co/datasets/pacoalberola/Poke-Grader-Dataset-Images-PSA), downloaded only through `huggingface_hub` (Hub `robots.txt` is `Allow: /`). This is **not** HTML scraping of eBay, PSA, Collectors, PWCC, or auction houses.

Legal review is in [`sources_report.md`](sources_report.md). Pilot numbers are in [`pilot_report.md`](pilot_report.md).

## Status

| Phase                                       | Status                                                                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1. Source discovery + legal review          | **Done.** One source is `collection_allowed`: `hf_pacoalberola_psa_images`.                                                     |
| 2. Pilot (target 100 valid cards per grade) | **Done** where the dump allows it. Grades 1–2 (and 4) are source-limited.                                                       |
| 3. Full collection (2k–5k per grade)        | **Not possible from this dump alone.** Integer PSA rows in the Hub set are on the order of ~2k, with 1s and 2s in the low tens. |
| 4. Dedup, crop, split, reports              | **Done** for the pilot corpus (`dataset/`, `pilot_report.md`, `qa/qa_sample.html`).                                             |

`collect.py` still requires `--i-have-reviewed-sources-report`. Collection is on for this Hub source only (`collection_enabled: true` in `config.yaml`). Do not flip other catalog entries without a new legal review.

## Pilot result (Hub PSA images)

Accepted training-eligible examples (`strong` labels, `capture_type=slab`):

| Grade |    Valid |
| ----: | -------: |
|     1 |       42 |
|     2 |       17 |
|     3 |      100 |
|     4 |       86 |
|  5–10 | 100 each |

Front+back pairs: **0**. Labels are **not** PSA cert API records. Typical shortest side is about **300–480 px** (floor is 280; originals are not upscaled). License logged as `huggingface-hub-public-dataset` — treat as internal research; do not republish images.

## Why slab images are not equivalent to raw card photographs

Professional graders photograph cards **inside a sealed holder**, under studio lighting, with a certification label in frame.

A model trained `slab pixels → PSA grade` can latch onto:

- holder plastic, glare, and label typography
- PSA’s own imaging setup
- the printed grade on the label (label leakage)

It will **not** reliably grade a raw card on a desk. Keep `capture_type` distinct:

- `slab` — professional holder photos (supervision for condition _in holder_)
- `raw` — user photographs of ungraded cards
- `catalog` — stock/print images (rejected for condition training)

The highest-value future set is raw photos of a physical card **later** joined to an actual PSA cert:

```text
raw_front_images / raw_back_images
predicted_grade
submitted_to_psa
psa_cert
actual_psa_grade
```

That schema is on every record (`user_contribution` / `user_*` parquet columns). It starts empty.

## How collection works

```text
scripts/discover_sources.py   # robots.txt + catalog → sources_report.md
scripts/collect.py --pilot --i-have-reviewed-sources-report
scripts/validate.py           # resolution, blur, glare, catalog rejection
scripts/deduplicate.py        # SHA-256, pHash, cert number
scripts/crop_cards.py         # optional crop + perspective rectify (originals kept)
scripts/qa_review.py          # 20 / 500 HTML review queue
scripts/build_splits.py       # 80/10/10 by physical card, plus OOD set holdout
scripts/dataset_stats.py      # tables, charts, dataset_report.md
```

Layout after collection:

```text
dataset/
  metadata.parquet
  train.parquet
  validation.parquet
  test.parquet
  ood_test.parquet
  dataset_stats.json
  failed_records.jsonl
  duplicates.jsonl
  grade_1/
    sample_000001_original_front.jpg
    sample_000001_original_back.jpg
    sample_000001_cropped_front.jpg
    ...
  grade_2/
  ...
```

A training sample is one **physical card** (`sample_id` / cert), not two independent images. Front and back share the same split.

## Legal rules this repo will not violate

- Check `robots.txt` and terms **before** any retrieval (see catalog).
- Prefer official APIs, Hub dataset downloads, or written licenses.
- Do not bypass authentication, CAPTCHAs, anti-bot systems, paywalls, or access controls.
- Do not rotate proxies, fingerprints, or accounts to evade a block.
- HTTP 401/403 or a CAPTCHA/block page **stops that domain**.
- Default rate limit: about **one request every 1.5–3 seconds** per host, with backoff on 429/5xx.
- Log source URL and license/usage status on every record.

Pokémon card artwork is owned by The Pokémon Company / Nintendo / Creatures / GAME FREAK. A Hugging Face “CC-BY” tag on a third-party dump does not transfer those rights, and does not legalize photos scraped from PSA, eBay, or auction houses.

## Known biases (even after a legal corpus exists)

- PSA 9/10 dominate public marketplaces; grades 1–4 are scarce.
- Iconic cards (Charizard, vintage holos) are over-copied.
- Official PSA imaging starts in earnest around late 2021 — older certs often lack photos.
- English modern cards will dominate unless Japanese/vintage are explicitly sampled.
- Slab domain ≠ raw domain.

The quota tracker stops a grade at `target_per_grade` (default 3000) and deprioritizes an exact card identity above ~5% of a grade bucket.

## Setup

```bash
cd grading-dataset
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python scripts/discover_sources.py --refresh-robots
python -m pytest
python scripts/collect.py --pilot --i-have-reviewed-sources-report
```

Playwright is **not** installed. It would only be added later for a source that (a) permits automated use and (b) truly requires JS for a public official page — never to defeat bot checks.

## Approving another source later

1. Re-read that source’s terms and license.
2. Confirm the intended **training** use is allowed (displaying a cert in an app ≠ training a model).
3. Set `collection_allowed: true` on that entry in `grading_dataset/catalog.py`.
4. For PSA: read the API End User Agreement, set `PSA_ML_USE_CONFIRMED=yes` only if permitted, provide `PSA_API_TOKEN` and a `PSA_CERT_LIST` you are allowed to query. Do not brute-force cert numbers.
5. Run a **pilot** (`--pilot`) before scaling.

Do not scrape blocked sites. Volume/quality jumps from here are a written PSA license, Hub access to `jyesr/pokemon-tcg-grading` if granted, or user-contributed raw photos later joined to real PSA certs.

## Contact Collectors/PSA

The only realistic path to 20k–50k **authoritative** slab pairs is a written data license. Ask for Pokémon TCG only, grades 1–10, front+back, cert metadata, non-generative condition-model training, and no public redistribution of PSA pixels.

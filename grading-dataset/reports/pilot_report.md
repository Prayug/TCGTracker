# Pilot notes

**Source:** Hugging Face `pacoalberola/Poke-Grader-Dataset-Images-PSA` via the official Hub file API (`huggingface_hub`). No eBay/PSA/Collectors HTML scraping.

**Labels:** PSA-only rows (`ebay_psa`, `pwcc_psa`) where the CSV integer grade agrees with the filename token. Confidence is `strong`, not PSA-cert `authoritative`. Half-grades and CGC/BGS/ACE rows were skipped.

**Images:** Marketplace slab photos. Typical shortest side ~300–480 px (below the original 500 px preference). Originals were not upscaled. Front/back pairs available: 0. `capture_type=slab`.

**Balance:** Grades 1–2 are scarce in this dump (about 60–66 PSA rows before filters). Quota is 100/grade where the source allows.

**License:** No SPDX on the Hub card. Logged as `huggingface-hub-public-dataset`. Treat as internal research; do not republish the images.

# Pilot dataset report

Total records: **1086**

## Grade table

| Grade | Valid examples | Front+Back | Front only | Rejected | Weak holdout |
| ----: | -------------: | ---------: | ---------: | -------: | -----------: |
|     1 |             42 |          0 |         42 |        0 |            0 |
|     2 |             17 |          0 |         17 |        0 |            0 |
|     3 |            100 |          0 |        100 |        2 |            0 |
|     4 |             86 |          0 |         86 |        4 |            0 |
|     5 |            100 |          0 |        100 |        2 |            0 |
|     6 |            100 |          0 |        100 |        0 |            0 |
|     7 |            100 |          0 |        100 |        0 |            0 |
|     8 |            100 |          0 |        100 |        1 |            0 |
|     9 |            100 |          0 |        100 |        0 |            0 |
|    10 |            100 |          0 |        100 |        2 |            0 |

- Rejected images: 11
- Duplicates removed: 230
- Average shortest side (px): 422.4
- Grade imbalance (max/min valid): 5.88

## Capture type

```
{'slab': 1086}
```

## Samples by source

```
{'hf_pacoalberola_psa_images': 1086}
```

## Source error rate (rejected / all)

```
{'hf_pacoalberola_psa_images': 0.010128913443830571}
```

## Year / set / language / identity (top)

- years: {}
- sets: {}
- languages: {}
- identities: {}

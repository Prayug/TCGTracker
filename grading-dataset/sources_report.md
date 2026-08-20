# Graded Pokémon card dataset — Phase 1 source report

_Discovery date: 2026-08-29. Collection source selected the same day._

## Executive finding

There is **no currently collectable** source that is simultaneously:

1. legally reusable for this ML/research purpose,
2. labeled with **authoritative PSA grades**,
3. high-resolution enough for defect inspection, and
4. large enough to hit 2,000–5,000 examples per grade 1–10.

**Source implemented:** `hf_pacoalberola_psa_images` — public Hugging Face dataset downloaded via `huggingface_hub` (not marketplace HTML). Labels are **strong** (CSV + filename agree), not PSA-cert **authoritative**. Pilot results are in `pilot_report.md`.

**Sources with `collection_allowed=true`:** 1 (`hf_pacoalberola_psa_images`). All other catalog entries stay blocked.

This dump cannot reach 2k–5k per grade. Grades 1–2 are scarce. Images are marketplace slab photos, typically ~300–480 px on the short side.

## What would actually train a raw-card grader

Slab photos of already-graded cards are **professional-grade supervision**, not a substitute for raw-card photography. A model trained `slab image → PSA grade` will pick up holder, label, and studio lighting cues. The eventual high-value set is:

`raw front + raw back` of a physical card **before** submission, later joined to `actual_psa_grade` via `psa_cert`.

That dataset does not exist publicly. The pipeline schema is ready for it.

## Legal constraints that ruled out the obvious corpora

- **Collectors / PSA website:** User Agreement bans robots, scrapers, and data mining of Content except through means purposely made available. PSA owns submission data and images.
- **PSA Public API:** Official cert lookup with grades and image URLs, but the End User Agreement is account-gated and does **not** obviously grant a redistributable training corpus. Lookup is by cert number only (not a catalog dump).
- **eBay HTML:** robots.txt and User Agreement prohibit automated access except search engines.
- **eBay APIs:** Permitted integration path, but the June 2025 API License Agreement restricts using Restricted API data to train AI, and listing titles are **weak** grade labels.
- **Heritage / Goldin / Fanatics Collect:** Auction photography with anti-bot systems (Cloudflare, DataDome, `/i-am-not-a-robot`). This pipeline will **stop** on 401/403/CAPTCHA and will not rotate proxies or fingerprints.
- **Third-party Hugging Face / GitHub dumps of eBay, PSA, or PWCC photos:** Hosting on the Hub is not a license chain. Several have **no license**, inferred marketplace grades, or documented scrape provenance.
- **Pokémon artwork:** Card faces remain copyright of The Pokémon Company / Nintendo / Creatures / GAME FREAK even when a dataset uploader slaps CC-BY on a repo.

This is not legal advice. It is an operational refusal to collect from sources that fail the project's own rules.

## Recommended next actions

1. **Ask Collectors/PSA** for a written research license: Pokémon TCG only, grades 1–10 balanced, front+back official images, cert numbers, permission to train a **non-generative** condition model, no public redistribution of raw PSA pixels.
2. **Build contributor intake** (Phase 2 schema already in code): users photograph raw cards, optionally submit to PSA, return cert + grade.
3. If you obtain Hugging Face access to `jyesr/pokemon-tcg-grading`, **read the license**. Even then, the card states grades are _expected_ PSA grades, not certs — keep them out of the authoritative training split.
4. Do **not** scrape PSA, Collectors, eBay, PWCC/Fanatics, Heritage, Goldin, Beckett, or CGC HTML.

## Live collection table (Phase 1 snapshot)

_This table was the discovery-time empty baseline. Current Hub pilot counts are in `pilot_report.md`._

| Grade | Valid examples | Front+Back | Front only | Rejected |
| ----: | -------------: | ---------: | ---------: | -------: |
|     1 |              0 |          0 |          0 |        0 |
|     2 |              0 |          0 |          0 |        0 |
|     3 |              0 |          0 |          0 |        0 |
|     4 |              0 |          0 |          0 |        0 |
|     5 |              0 |          0 |          0 |        0 |
|     6 |              0 |          0 |          0 |        0 |
|     7 |              0 |          0 |          0 |        0 |
|     8 |              0 |          0 |          0 |        0 |
|     9 |              0 |          0 |          0 |        0 |
|    10 |              0 |          0 |          0 |        0 |

## Summary counts

- Recommended (legal path, still not collectable): **2**
- Conditional (review license/EUA first): **7**
- Not recommended / skip: **16**

---

# Recommended

## PSA / Collectors written research or commercial data license (not yet obtained)

- **Source id:** `psa_written_research_license`
- **URL:** https://www.psacard.com/publicapi
- **Available grades:** PSA 1–10 with cert metadata
- **Estimated image count:** Only path that could legally approach 20k–50k official slab pairs
- **Image resolution:** Official
- **Front/back availability:** Yes when imaged
- **Label quality:** authoritative
- **License / terms:** Would be defined by the negotiated agreement
- **Scraping / API permission:** `official_api`
- **robots.txt:** https://www.psacard.com/robots.txt
  - N/A until a license exists.
- **Terms:** https://www.psacard.com/termsandconditions
  - Collectors ToS already says written authorization is required to exploit Content.
- **Capture type:** `slab`
- **collection_allowed:** `False`
- **Recommendation:** Recommended (not collectable until rights exist)
- **Reason:** Recommended as the primary legal path for authoritative slab supervision. Do not collect until a signed agreement exists. collection_allowed stays False until that agreement is filed.
- Note: Ask for: Pokémon TCG only; balanced sample across grades 1–10; front+back; cert numbers; permission to train a non-generative condition model; no public redistribution of raw PSA images.

## User-contributed raw photos with later PSA outcomes (Phase 2 schema)

- **Source id:** `user_contributed_raw_psa`
- **URL:** internal://user-contributed
- **Available grades:** Actual PSA 1–10 once the same physical card returns from PSA
- **Estimated image count:** Starts at zero; highest long-term value per example
- **Image resolution:** Controlled capture (target ≥1000 px short side)
- **Front/back availability:** Required
- **Label quality:** authoritative
- **License / terms:** Contributor license + Pokémon IP still applies to card artwork; grades are facts about a physical object
- **Scraping / API permission:** `n_a`
- **robots.txt:** n/a
  - No web collection.
- **Terms:** n/a
  - Need a contributor agreement covering training use, withdrawal, and no redistribution of identity-bearing photos if any.
- **Capture type:** `raw`
- **collection_allowed:** `False`
- **Recommendation:** Recommended (not collectable until rights exist)
- **Reason:** Recommended as the highest-value dataset for a raw-card grader. Not a scrape source. Enable only after contributor terms and app intake exist. Schema is prepared now.
- Note: Paired fields: raw_front_images, raw_back_images, predicted_grade, submitted_to_psa, psa_cert, actual_psa_grade.
- Note: Never mix unlabeled raw photos into the PSA-supervised training split.

---

# Conditional

## PSA Public API (cert verification)

- **Source id:** `psa_public_api`
- **URL:** https://www.psacard.com/publicapi
- **Available grades:** PSA 1–10 (plus qualifiers) for any cert that exists
- **Estimated image count:** Potentially large, but not enumerable. Lookup is by known cert number only. Official images generally exist for certs graded after about October 2021.
- **Image resolution:** Official slab photos; typically high enough for defect inspection when present
- **Front/back availability:** Yes, when PSA scanned the cert (front and back URLs in API response)
- **Label quality:** authoritative
- **License / terms:** PSA owns Submission Content (data and images) under PSA Submission Terms §23. Public API access is gated by the PSA API End User Agreement (login required; full text not publicly readable without an account). Website content is separately copyrighted by Collectors.
- **Scraping / API permission:** `official_api`
- **robots.txt:** https://www.psacard.com/robots.txt
  - User-agent: \* ; Crawl-delay: 1; Disallow /content/pdf/, /dealers/gotodealer/, /myaccount/. The HTML site is also behind Cloudflare bot management. robots.txt does not authorize bulk image harvesting of cert pages.
- **Terms:** https://www.psacard.com/termsandconditions
  - Collectors User Agreement prohibits robots, scrapers, and data mining of Services/Content except through means purposely made available. The Public API is the purposely-available channel for cert verification and displaying cert details in an application. That is not the same as permission to build a redistributable ML training corpus.
- **Capture type:** `slab`
- **collection_allowed:** `False`
- **Recommendation:** Conditional — do not collect yet
- **Reason:** Best authoritative label source, but bulk storage of PSA images for model training is not confirmed by a public license. Use only after (1) accepting the API EUA, (2) confirming the EUA allows this research/training use, and (3) preferably a written Collectors/PSA data license. Do not scrape psacard.com or collectors.com.
- Note: API methods: single-item cert search by cert number.
- Note: Third-party reports cite ~100 lookups/day on the free tier; treat as unverified until the EUA is reviewed.
- Note: No population-report or catalog-browse endpoint on the public API.
- Note: Contact: Collectors/PSA business development for a research license.

## Hugging Face: jyesr/pokemon-tcg-grading

- **Source id:** `hf_jyesr_pokemon_tcg_grading`
- **URL:** https://huggingface.co/datasets/jyesr/pokemon-tcg-grading
- **Available grades:** Claimed 1–10, but documented as expected PSA grade if submitted, not actual PSA results
- **Estimated image count:** Dataset card: 14,900 rows shown, ~50,232 estimated; 17 GB; 20K+ front/back scans advertised
- **Image resolution:** 2400px × ~1430px
- **Front/back availability:** Yes (front and back scans)
- **Label quality:** weak
- **License / terms:** Unknown. Dataset is gated (HTTP 401 without Hugging Face access). License cannot be confirmed until access is granted and the card is reviewed.
- **Scraping / API permission:** `official_dataset_download`
- **robots.txt:** https://huggingface.co/robots.txt
  - User-agent: \* Allow: /. Official Hub download is the permitted channel.
- **Terms:** https://huggingface.co/terms
  - Hub hosting is not a license to the underlying Pokémon artwork or to any scraped third-party photos. Dataset license, if any, only covers rights the uploader actually holds.
- **Capture type:** `raw`
- **collection_allowed:** `False`
- **Recommendation:** Conditional — do not collect yet
- **Reason:** Closest public ML-shaped corpus (high-res front/back). Labels are explicitly expected grades, not PSA certs — do not treat as authoritative. Do not download until the gated license is reviewed and confirmed to cover this research use. Modern-card bias noted on the card (collected 2026).
- Note: If accessed later, assign grade_label_confidence=weak unless cert numbers are present.
- Note: Useful as auxiliary condition diversity only after license clearance.

## Hugging Face: pacoalberola/Poke-Grader-Dataset-Images-PSA

- **Source id:** `hf_pacoalberola_psa_images`
- **URL:** https://huggingface.co/datasets/pacoalberola/Poke-Grader-Dataset-Images-PSA
- **Available grades:** Integer 1–10 plus half-grades mixed across PSA/CGC/BGS/ACE
- **Estimated image count:** 3,156 labeled rows in grades.csv; 282 MB total
- **Image resolution:** Not documented; marketplace listing photos (often slab shots)
- **Front/back availability:** Not paired in metadata; typically one listing photo per row
- **Label quality:** strong
- **License / terms:** huggingface-hub-public-dataset
- **Scraping / API permission:** `official_dataset_download`
- **robots.txt:** https://huggingface.co/robots.txt
  - Hub download permitted by robots.txt. Collection uses huggingface_hub, not HTML scraping.
- **Terms:** https://huggingface.co/datasets/pacoalberola/Poke-Grader-Dataset-Images-PSA
  - No SPDX license on the dataset card. Chosen as the only public Hub dataset with structured PSA 1–10 image labels. Downloads go through the official Hub file API. Underlying listing photos may not be redistributable; keep this corpus internal.
- **Capture type:** `slab`
- **collection_allowed:** `True`
- **Recommendation:** Conditional — do not collect yet
- **Reason:** Enabled: official Hugging Face dataset download (robots Allow: /). PSA-only rows (ebay_psa / pwcc_psa) with integer grades. Not a PSA cert API. Grade 1–2 are scarce. Typical shortest side ~300–480 px.
- Note: PSA-only counts ≈ 1=60, 2=66, 3=165, 4=139, 5=182, 6=234, 7=300, 8=472, 9=300, 10=321.
- Note: Prefer PWCC files (often ~430–480 px short side) over eBay (~300 px).
- Note: Do not scrape eBay or PWCC/Fanatics directly.

## Hugging Face: lding101/pokemon-card-grades

- **Source id:** `hf_lding101_pokemon_card_grades`
- **URL:** https://huggingface.co/datasets/lding101/pokemon-card-grades
- **Available grades:** Unknown until gated access is granted
- **Estimated image count:** 1,118 exported rows; 858 MB (implies relatively large files)
- **Image resolution:** Unknown; 858 MB / 1118 ≈ 0.77 MB per row average
- **Front/back availability:** Unknown
- **Label quality:** unknown
- **License / terms:** Gated. Must accept Hub conditions and review license before any use.
- **Scraping / API permission:** `official_dataset_download`
- **robots.txt:** https://huggingface.co/robots.txt
  - Hub Allow: /
- **Terms:** https://huggingface.co/datasets/lding101/pokemon-card-grades
  - Gated dataset: 'agree to share contact information to access'. Card text: exported from agreed label/crop pairs in a local SQLite database.
- **Capture type:** `slab`
- **collection_allowed:** `False`
- **Recommendation:** Conditional — do not collect yet
- **Reason:** Too small for the target, gated, license unread. Revisit only after accepting Hub terms and confirming label authority and rights.

## Roboflow Universe: find-card-in-psa (object detection)

- **Source id:** `roboflow_find_card_in_psa`
- **URL:** https://universe.roboflow.com/findpokemoncard/find-card-in-psa
- **Available grades:** None (bounding boxes for card-in-slab detection)
- **Estimated image count:** Small detection set (not a grade corpus)
- **Image resolution:** Training resolution; typically resized
- **Front/back availability:** N/A
- **Label quality:** none
- **License / terms:** Roboflow Universe datasets are commonly CC BY 4.0; confirm on the project page before download.
- **Scraping / API permission:** `official_dataset_download`
- **robots.txt:** https://universe.roboflow.com/robots.txt
  - Disallow dataset image browse/download paths for crawlers. Use the official Roboflow export/API, not HTML scraping.
- **Terms:** https://roboflow.com/terms
  - Download via Roboflow tools after accepting project license.
- **Capture type:** `slab`
- **collection_allowed:** `False`
- **Recommendation:** Conditional — do not collect yet
- **Reason:** Useful later as cropper supervision, not as PSA grade labels. Download only via official export after confirming CC-BY (or other) license.

## Roboflow Universe: Group 6 card-grader

- **Source id:** `roboflow_card_grader`
- **URL:** https://universe.roboflow.com/group-6-major-project/card-grader
- **Available grades:** Defect classes (edge wear, scratch, corner wear), not PSA 1–10
- **Estimated image count:** 1,256 images (v4 cited in model card)
- **Image resolution:** Training resolution
- **Front/back availability:** N/A
- **Label quality:** none
- **License / terms:** Confirm on project page (Universe default is often CC BY 4.0).
- **Scraping / API permission:** `official_dataset_download`
- **robots.txt:** https://universe.roboflow.com/robots.txt
  - Do not scrape /dataset/\*/download. Use official export.
- **Terms:** https://roboflow.com/terms
  - Academic group project, 2022.
- **Capture type:** `raw`
- **collection_allowed:** `False`
- **Recommendation:** Conditional — do not collect yet
- **Reason:** Too small and wrong labels for the PSA 1–10 goal. Optional cropper/defect auxiliary after license check.

## Manual import of an already-licensed archive

- **Source id:** `manual_licensed_import`
- **URL:** internal://manual-import
- **Available grades:** Whatever the archive contains
- **Estimated image count:** Depends on the archive
- **Image resolution:** Depends on the archive
- **Front/back availability:** Depends on the archive
- **Label quality:** unknown
- **License / terms:** Must be supplied per import (SPDX or contract id)
- **Scraping / API permission:** `n_a`
- **robots.txt:** n/a
  - Offline import only.
- **Terms:** n/a
  - Operator must attach license text and refuse import if missing.
- **Capture type:** `unknown`
- **collection_allowed:** `False`
- **Recommendation:** Conditional — do not collect yet
- **Reason:** Safe adapter for a future licensed dump. Disabled until an archive with documented rights is provided.

---

# Not recommended — skip

## PSA / Collectors.com website (HTML cert pages, Card Facts, pop report)

- **Source id:** `psa_collectors_website`
- **URL:** https://www.psacard.com
- **Available grades:** PSA 1–10
- **Estimated image count:** Very large (full PSA cert image corpus)
- **Image resolution:** Official slab photos
- **Front/back availability:** Yes when imaged
- **Label quality:** authoritative
- **License / terms:** Collectors/PSA proprietary. Images and data owned by PSA.
- **Scraping / API permission:** `prohibited`
- **robots.txt:** https://www.psacard.com/robots.txt
  - Limited Disallow list, Crawl-delay 1. Does not override ToS scrape ban. Site uses Cloudflare.
- **Terms:** https://app.collectors.com/collectorsuseragreement
  - Explicit ban on deep-link, page-scrape, robot, spider, or other automatic device to retrieve, copy, or monitor Content. Content may not be copied or used to create derivative works except as expressly authorized in writing.
- **Capture type:** `slab`
- **collection_allowed:** `False`
- **Recommendation:** Not recommended — skip
- **Reason:** Automated HTML collection is prohibited. Do not scrape. Use the official API only if the EUA permits the specific use, or obtain a written license.

## eBay listing HTML (scraping)

- **Source id:** `ebay_html`
- **URL:** https://www.ebay.com
- **Available grades:** Seller-claimed PSA/BGS/CGC grades in titles; unreliable
- **Estimated image count:** Very large
- **Image resolution:** Highly variable seller photos; many thumbnails and UI screenshots
- **Front/back availability:** Sometimes, as separate listing photos
- **Label quality:** weak
- **License / terms:** Seller-owned photos; eBay catalog data licensed only for listings on eBay
- **Scraping / API permission:** `prohibited`
- **robots.txt:** https://www.ebay.com/robots.txt
  - Header states automated access without express permission is strictly prohibited except for public search engines. Extensive Disallow list. Checkout automation explicitly banned.
- **Terms:** https://www.ebay.com/help/policies/member-behaviour-policies/user-agreement?id=4259
  - User Agreement restricts automated access. Catalog images may not be used to create derivative works outside listings.
- **Capture type:** `mixed`
- **collection_allowed:** `False`
- **Recommendation:** Not recommended — skip
- **Reason:** Scraping prohibited. Labels from titles are weak. Seller photos are not PSA-authoritative.

## eBay Browse / Marketplace APIs

- **Source id:** `ebay_browse_api`
- **URL:** https://developer.ebay.com
- **Available grades:** Item specifics sometimes include Professional Grader + Grade; still seller-asserted
- **Estimated image count:** Large, but not a grading corpus
- **Image resolution:** Listing photos; variable
- **Front/back availability:** Inconsistent
- **Label quality:** weak
- **License / terms:** eBay API License Agreement. June 2025 update restricts using Restricted API data to train / ingest into AI models without written consent.
- **Scraping / API permission:** `official_api`
- **robots.txt:** https://www.ebay.com/robots.txt
  - N/A for official API. HTML scraping remains prohibited.
- **Terms:** https://developer.ebay.com/join/api-license-agreement
  - Official APIs are the permitted integration path. The 2025 API License Agreement added AI-training restrictions on Restricted API data. Listing images are not licensed for a public ML dataset.
- **Capture type:** `mixed`
- **collection_allowed:** `False`
- **Recommendation:** Not recommended — skip
- **Reason:** Even via the official API, using eBay listing content to train a model is restricted and labels are weak. Skip for this dataset. TCGTracker may continue using the Browse API for market features, which is a different purpose.

## Hugging Face: pacoalberola/Poke-Grader-Defect-Dataset-2000cards-v2

- **Source id:** `hf_pacoalberola_defects`
- **URL:** https://huggingface.co/datasets/pacoalberola/Poke-Grader-Defect-Dataset-2000cards-v2
- **Available grades:** Defect class labels, not PSA 1–10
- **Estimated image count:** ~12.3k rows including augmentations
- **Image resolution:** Small training crops (viewer samples ~224px class)
- **Front/back availability:** Not a paired slab dataset
- **Label quality:** none
- **License / terms:** None published
- **Scraping / API permission:** `official_dataset_download`
- **robots.txt:** https://huggingface.co/robots.txt
  - Hub Allow: /
- **Terms:** https://huggingface.co/datasets/pacoalberola/Poke-Grader-Defect-Dataset-2000cards-v2
  - Augmented copies (aug_0, aug_1, …) are unsafe for defect learning if enhancement artifacts exist.
- **Capture type:** `unknown`
- **collection_allowed:** `False`
- **Recommendation:** Not recommended — skip
- **Reason:** Wrong task (defect classes / augmentations), no PSA grades, no license.

## Hugging Face: rrhagentbiz/pokemon-card-centering-measurements

- **Source id:** `hf_rrhagentbiz_centering`
- **URL:** https://huggingface.co/datasets/rrhagentbiz/pokemon-card-centering-measurements
- **Available grades:** None (centering pass/fail vs PSA 9/10 windows, not actual grades)
- **Estimated image count:** 0 images; 320 tabular rows
- **Image resolution:** N/A
- **Front/back availability:** N/A
- **Label quality:** none
- **License / terms:** CC-BY-4.0 (metadata only)
- **Scraping / API permission:** `official_dataset_download`
- **robots.txt:** https://huggingface.co/robots.txt
  - Hub Allow: /
- **Terms:** https://huggingface.co/datasets/rrhagentbiz/pokemon-card-centering-measurements
  - Compiled from eBay listing photos; CSV does not include the photos.
- **Capture type:** `n_a`
- **collection_allowed:** `False`
- **Recommendation:** Not recommended — skip
- **Reason:** No images and no professional grades. Optional reference for centering thresholds only.

## Hugging Face / Kaggle catalog card image sets (TheFusion21, priyamchoksi, ellimaaac, pokemontcg.io)

- **Source id:** `hf_thefusion21_pokemoncards`
- **URL:** https://huggingface.co/datasets/TheFusion21/PokemonCards
- **Available grades:** None
- **Estimated image count:** 10k–21k catalog renders
- **Image resolution:** Official/hi-res catalog scans (typically 600px+)
- **Front/back availability:** Usually front only
- **Label quality:** none
- **License / terms:** Pokémon Company / Nintendo / Creatures / GAME FREAK artwork. Dataset wrappers do not grant those rights.
- **Scraping / API permission:** `official_api`
- **robots.txt:** https://pokemontcg.io/robots.txt
  - pokemontcg.io publishes content-signals covering search / AI input / AI training. Use only the official Pokémon TCG API if collecting catalog metadata.
- **Terms:** https://docs.pokemontcg.io
  - Catalog images are stock/print images, not condition photographs.
- **Capture type:** `catalog`
- **collection_allowed:** `False`
- **Recommendation:** Not recommended — skip
- **Reason:** Stock/catalog images must be rejected for a condition model. Useful only later as negative examples or identity matching, with separate rights review.

## GitHub: samsilverman/PSA-Baseball-Grades

- **Source id:** `github_psa_baseball_grades`
- **URL:** https://github.com/samsilverman/PSA-Baseball-Grades
- **Available grades:** PSA 1–10, 1,150 images each (11,500 total)
- **Estimated image count:** 11,500
- **Image resolution:** 150×200 (below this pipeline's 500px minimum; padded/scaled)
- **Front/back availability:** Unknown / not designed as pairs
- **Label quality:** weak
- **License / terms:** None listed
- **Scraping / API permission:** `prohibited`
- **robots.txt:** https://www.collectors.com/robots.txt
  - README states data was collected with ParseHub from Collectors.com.
- **Terms:** https://app.collectors.com/collectorsuseragreement
  - Collectors ToS prohibits scraping. Redistributing that scrape does not create a clean license.
- **Capture type:** `slab`
- **collection_allowed:** `False`
- **Recommendation:** Not recommended — skip
- **Reason:** Wrong sport, too small, known bad labels/duplicates, below resolution floor, scraped from a prohibited source.

## GitHub: crimsonthinker/psa_pokemon_cards

- **Source id:** `github_crimsonthinker`
- **URL:** https://github.com/crimsonthinker/psa_pokemon_cards
- **Available grades:** Per-aspect scores (centering/corners/edges/surface), not necessarily official PSA certs
- **Estimated image count:** Repo size ~119 MB; images live under data/[id]/{front,back}.jpg if present in clone
- **Image resolution:** README references 1680×3147 originals
- **Front/back availability:** Yes (front and back per id)
- **Label quality:** unknown
- **License / terms:** None listed
- **Scraping / API permission:** `unknown`
- **robots.txt:** n/a
  - GitHub clone is not a license for the photographs.
- **Terms:** https://github.com/crimsonthinker/psa_pokemon_cards
  - No LICENSE file. Provenance of data/ images is undocumented.
- **Capture type:** `unknown`
- **collection_allowed:** `False`
- **Recommendation:** Not recommended — skip
- **Reason:** No license and no provenance. Do not ingest until the author documents rights and whether grades are actual PSA certs.

## GitHub: jonathan-rasmussen/gotta_catch_em_all (Queen's University SharePoint dumps)

- **Source id:** `github_gotta_catch_em_all`
- **URL:** https://github.com/jonathan-rasmussen/gotta_catch_em_all
- **Available grades:** Claimed PSA; undocumented
- **Estimated image count:** Advertised 28.1 GB 'Original PSA Dataset' + 16.5 GB 'PWCC Dataset'
- **Image resolution:** Unknown (large archives suggest high-res scans)
- **Front/back availability:** Unknown
- **Label quality:** unknown
- **License / terms:** None. Hosted on personal Queen's University OneDrive links.
- **Scraping / API permission:** `prohibited`
- **robots.txt:** n/a
  - Named as PSA and PWCC dumps. PWCC/Fanatics and PSA both restrict automated harvesting.
- **Terms:** https://github.com/jonathan-rasmussen/gotta_catch_em_all
  - SharePoint links may expire. No rights statement.
- **Capture type:** `slab`
- **collection_allowed:** `False`
- **Recommendation:** Not recommended — skip
- **Reason:** Likely unlicensed redistribution of PSA/PWCC images. Skip.

## Heritage Auctions

- **Source id:** `heritage_auctions`
- **URL:** https://www.ha.com
- **Available grades:** Lot titles often include PSA/CGC/BGS + cert
- **Estimated image count:** Large auction archive
- **Image resolution:** Auction photography; often high, but lot-dependent
- **Front/back availability:** Often multiple lot photos
- **Label quality:** strong
- **License / terms:** Heritage proprietary lot photography
- **Scraping / API permission:** `prohibited`
- **robots.txt:** https://www.ha.com/robots.txt
  - User-agent \* Crawl-delay 15. Disallow cart, bid, invoice, wantlist, live, etc. Independent reports: DataDome returns 403 on most ha.com paths. Do not bypass.
- **Terms:** https://www.ha.com
  - Auction houses typically prohibit scraping and reuse of lot images for competing products/datasets.
- **Capture type:** `slab`
- **collection_allowed:** `False`
- **Recommendation:** Not recommended — skip
- **Reason:** Anti-bot protection plus typical auction ToS. Stop rather than evade. No public ML license.

## Goldin

- **Source id:** `goldin`
- **URL:** https://goldin.co
- **Available grades:** Auction lots with professional grades
- **Estimated image count:** Large
- **Image resolution:** Auction photography
- **Front/back availability:** Often
- **Label quality:** strong
- **License / terms:** Goldin proprietary
- **Scraping / API permission:** `prohibited`
- **robots.txt:** https://goldin.co/robots.txt
  - Disallow /account/, /api/, /assets/, /static/. Allow selected public lot paths. Disallow of /api/ means do not hit undocumented APIs.
- **Terms:** https://goldin.co
  - No public dataset license. Undocumented API is disallowed by robots.txt.
- **Capture type:** `slab`
- **collection_allowed:** `False`
- **Recommendation:** Not recommended — skip
- **Reason:** robots.txt disallows /api/. No ML license. Skip.

## Fanatics Collect (formerly PWCC)

- **Source id:** `fanatics_collect`
- **URL:** https://www.fanaticscollect.com
- **Available grades:** PSA/BGS/CGC/SGC lots
- **Estimated image count:** Large
- **Image resolution:** Marketplace/auction photography
- **Front/back availability:** Often
- **Label quality:** strong
- **License / terms:** Fanatics Collect proprietary
- **Scraping / API permission:** `prohibited`
- **robots.txt:** https://www.fanaticscollect.com/robots.txt
  - Disallow /login, /join, /i-am-not-a-robot, /share/, email verify. Presence of /i-am-not-a-robot indicates active bot challenges.
- **Terms:** https://www.fanaticscollect.com
  - Third-party commercial scrapers exist; that does not make collection permitted.
- **Capture type:** `slab`
- **collection_allowed:** `False`
- **Recommendation:** Not recommended — skip
- **Reason:** Bot challenges and no public license. Do not bypass /i-am-not-a-robot.

## CGC Cards cert lookup / CCG Dealer API

- **Source id:** `cgc_website_and_dealer_api`
- **URL:** https://www.cgccards.com
- **Available grades:** CGC scale (not PSA 1–10; mapping is lossy)
- **Estimated image count:** Large official holder images
- **Image resolution:** Official holder photos when present
- **Front/back availability:** Yes when imaged
- **Label quality:** authoritative
- **License / terms:** CGC/CCG owns compiled data and images (submission terms grant CGC commercialization rights).
- **Scraping / API permission:** `official_api`
- **robots.txt:** https://www.cgccards.com/robots.txt
  - user-agent \* Allow: /. Public cert lookup is rate-limited ('search activity has exceeded our limits').
- **Terms:** https://www.cgccomics.com/legal/terms-of-use/
  - Website terms: personal, non-commercial viewing; do not use graphics separately from accompanying text. Dealer API is OAuth for dealers, not a public bulk-download grant.
- **Capture type:** `slab`
- **collection_allowed:** `False`
- **Recommendation:** Not recommended — skip
- **Reason:** Authoritative CGC labels, but (1) not PSA, (2) website reuse is personal-use only, (3) Dealer API requires dealer credentials and does not by itself authorize an ML corpus. Skip unless CGC grants written research rights.

## Beckett / BGS

- **Source id:** `beckett_bgs`
- **URL:** https://www.beckett.com
- **Available grades:** BGS 1–10 with subgrades
- **Estimated image count:** Large
- **Image resolution:** Official when present
- **Front/back availability:** Varies
- **Label quality:** authoritative
- **License / terms:** Beckett owns Data and Images (ToS assignment).
- **Scraping / API permission:** `prohibited`
- **robots.txt:** https://www.beckett.com/robots.txt
  - HTTP 403 when fetching robots.txt during discovery (2026-08-29). Treat as blocked automated access.
- **Terms:** https://www.beckett.com/tos
  - Beckett claims ownership of submission data and images and may exploit them commercially.
- **Capture type:** `slab`
- **collection_allowed:** `False`
- **Recommendation:** Not recommended — skip
- **Reason:** Wrong grader for a PSA-only target; robots.txt fetch was blocked; ToS does not permit bulk reuse.

## Wikimedia Commons Pokémon TCG scans

- **Source id:** `wikimedia_commons`
- **URL:** https://commons.wikimedia.org
- **Available grades:** Almost never professionally graded
- **Estimated image count:** Low hundreds of card scans at most, mixed licenses
- **Image resolution:** Variable
- **Front/back availability:** Rarely paired
- **Label quality:** none
- **License / terms:** Per-file (CC-BY-SA, public domain, etc.). Pokémon artwork rights still sit with TPC/Nintendo.
- **Scraping / API permission:** `official_api`
- **robots.txt:** https://commons.wikimedia.org/robots.txt
  - MediaWiki API is the permitted access method.
- **Terms:** https://commons.wikimedia.org/wiki/Commons:Licensing
  - Must honor each file's license and attribution. Commons license does not waive Pokémon IP.
- **Capture type:** `catalog`
- **collection_allowed:** `False`
- **Recommendation:** Not recommended — skip
- **Reason:** Cannot reach 2,000 examples per PSA grade. No authoritative grades. Optional identity/diversity supplement only.

## Zenodo: Pokémon TCG price/rarity review dataset (10.5281/zenodo.15697369)

- **Source id:** `zenodo_tcg_price_rarity`
- **URL:** https://doi.org/10.5281/zenodo.15697369
- **Available grades:** None
- **Estimated image count:** Not a graded-image corpus
- **Image resolution:** N/A
- **Front/back availability:** N/A
- **Label quality:** none
- **License / terms:** Check Zenodo record (academic dataset; likely tabular).
- **Scraping / API permission:** `official_dataset_download`
- **robots.txt:** https://zenodo.org/robots.txt
  - Zenodo allows dataset download of published records.
- **Terms:** https://doi.org/10.5281/zenodo.15697369
  - Binus University 2025 record on factors affecting price and rarity.
- **Capture type:** `n_a`
- **collection_allowed:** `False`
- **Recommendation:** Not recommended — skip
- **Reason:** Wrong data type for a condition/grade vision dataset.

---

## Phase 2 / 3 / 4 status

- **Phase 2 (pilot, 100 per grade):** blocked until at least one source is approved and `collection_allowed` is set.
- **Phase 3 (full 2k–5k per grade):** not started.
- **Phase 4 (clean/split):** code is ready; no data to split.

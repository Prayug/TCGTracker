"""Static catalog of candidate sources evaluated during Phase 1 discovery.

This file is the source of truth for legal status. Collection code refuses
any source with collection_allowed=False. Do not flip that flag to True
without re-checking robots.txt, terms, and intended ML use.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Literal

Recommendation = Literal["recommended", "conditional", "not_recommended"]
ScrapingPermission = Literal[
    "official_api",
    "official_dataset_download",
    "permitted_static",
    "prohibited",
    "unknown",
    "n_a",
]
LabelQuality = Literal["authoritative", "strong", "weak", "none", "unknown"]


@dataclass(frozen=True)
class SourceRecord:
    id: str
    name: str
    url: str
    available_grades: str
    estimated_image_count: str
    image_resolution: str
    front_back: str
    label_quality: LabelQuality
    license: str
    scraping_permission: ScrapingPermission
    robots_txt_url: str
    robots_notes: str
    terms_url: str
    terms_notes: str
    recommendation: Recommendation
    collection_allowed: bool
    reason: str
    capture_type: str = "slab"
    notes: list[str] = field(default_factory=list)
    checked_at: str = "2026-08-29"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


SOURCES: tuple[SourceRecord, ...] = (
    SourceRecord(
        id="psa_public_api",
        name="PSA Public API (cert verification)",
        url="https://www.psacard.com/publicapi",
        available_grades="PSA 1–10 (plus qualifiers) for any cert that exists",
        estimated_image_count=(
            "Potentially large, but not enumerable. Lookup is by known cert "
            "number only. Official images generally exist for certs graded "
            "after about October 2021."
        ),
        image_resolution="Official slab photos; typically high enough for defect inspection when present",
        front_back="Yes, when PSA scanned the cert (front and back URLs in API response)",
        label_quality="authoritative",
        license=(
            "PSA owns Submission Content (data and images) under PSA Submission "
            "Terms §23. Public API access is gated by the PSA API End User "
            "Agreement (login required; full text not publicly readable without "
            "an account). Website content is separately copyrighted by Collectors."
        ),
        scraping_permission="official_api",
        robots_txt_url="https://www.psacard.com/robots.txt",
        robots_notes=(
            "User-agent: * ; Crawl-delay: 1; Disallow /content/pdf/, "
            "/dealers/gotodealer/, /myaccount/. The HTML site is also behind "
            "Cloudflare bot management. robots.txt does not authorize bulk "
            "image harvesting of cert pages."
        ),
        terms_url="https://www.psacard.com/termsandconditions",
        terms_notes=(
            "Collectors User Agreement prohibits robots, scrapers, and data "
            "mining of Services/Content except through means purposely made "
            "available. The Public API is the purposely-available channel for "
            "cert verification and displaying cert details in an application. "
            "That is not the same as permission to build a redistributable ML "
            "training corpus."
        ),
        recommendation="conditional",
        collection_allowed=False,
        reason=(
            "Best authoritative label source, but bulk storage of PSA images "
            "for model training is not confirmed by a public license. Use only "
            "after (1) accepting the API EUA, (2) confirming the EUA allows "
            "this research/training use, and (3) preferably a written Collectors/"
            "PSA data license. Do not scrape psacard.com or collectors.com."
        ),
        notes=[
            "API methods: single-item cert search by cert number.",
            "Third-party reports cite ~100 lookups/day on the free tier; treat as unverified until the EUA is reviewed.",
            "No population-report or catalog-browse endpoint on the public API.",
            "Contact: Collectors/PSA business development for a research license.",
        ],
    ),
    SourceRecord(
        id="psa_collectors_website",
        name="PSA / Collectors.com website (HTML cert pages, Card Facts, pop report)",
        url="https://www.psacard.com",
        available_grades="PSA 1–10",
        estimated_image_count="Very large (full PSA cert image corpus)",
        image_resolution="Official slab photos",
        front_back="Yes when imaged",
        label_quality="authoritative",
        license="Collectors/PSA proprietary. Images and data owned by PSA.",
        scraping_permission="prohibited",
        robots_txt_url="https://www.psacard.com/robots.txt",
        robots_notes="Limited Disallow list, Crawl-delay 1. Does not override ToS scrape ban. Site uses Cloudflare.",
        terms_url="https://app.collectors.com/collectorsuseragreement",
        terms_notes=(
            "Explicit ban on deep-link, page-scrape, robot, spider, or other "
            "automatic device to retrieve, copy, or monitor Content. Content "
            "may not be copied or used to create derivative works except as "
            "expressly authorized in writing."
        ),
        recommendation="not_recommended",
        collection_allowed=False,
        reason="Automated HTML collection is prohibited. Do not scrape. Use the official API only if the EUA permits the specific use, or obtain a written license.",
    ),
    SourceRecord(
        id="ebay_html",
        name="eBay listing HTML (scraping)",
        url="https://www.ebay.com",
        available_grades="Seller-claimed PSA/BGS/CGC grades in titles; unreliable",
        estimated_image_count="Very large",
        image_resolution="Highly variable seller photos; many thumbnails and UI screenshots",
        front_back="Sometimes, as separate listing photos",
        label_quality="weak",
        license="Seller-owned photos; eBay catalog data licensed only for listings on eBay",
        scraping_permission="prohibited",
        robots_txt_url="https://www.ebay.com/robots.txt",
        robots_notes=(
            "Header states automated access without express permission is "
            "strictly prohibited except for public search engines. Extensive "
            "Disallow list. Checkout automation explicitly banned."
        ),
        terms_url="https://www.ebay.com/help/policies/member-behaviour-policies/user-agreement?id=4259",
        terms_notes="User Agreement restricts automated access. Catalog images may not be used to create derivative works outside listings.",
        recommendation="not_recommended",
        collection_allowed=False,
        reason="Scraping prohibited. Labels from titles are weak. Seller photos are not PSA-authoritative.",
        capture_type="mixed",
    ),
    SourceRecord(
        id="ebay_browse_api",
        name="eBay Browse / Marketplace APIs",
        url="https://developer.ebay.com",
        available_grades="Item specifics sometimes include Professional Grader + Grade; still seller-asserted",
        estimated_image_count="Large, but not a grading corpus",
        image_resolution="Listing photos; variable",
        front_back="Inconsistent",
        label_quality="weak",
        license="eBay API License Agreement. June 2025 update restricts using Restricted API data to train / ingest into AI models without written consent.",
        scraping_permission="official_api",
        robots_txt_url="https://www.ebay.com/robots.txt",
        robots_notes="N/A for official API. HTML scraping remains prohibited.",
        terms_url="https://developer.ebay.com/join/api-license-agreement",
        terms_notes=(
            "Official APIs are the permitted integration path. The 2025 API "
            "License Agreement added AI-training restrictions on Restricted "
            "API data. Listing images are not licensed for a public ML dataset."
        ),
        recommendation="not_recommended",
        collection_allowed=False,
        reason=(
            "Even via the official API, using eBay listing content to train a "
            "model is restricted and labels are weak. Skip for this dataset. "
            "TCGTracker may continue using the Browse API for market features, "
            "which is a different purpose."
        ),
        capture_type="mixed",
    ),
    SourceRecord(
        id="hf_jyesr_pokemon_tcg_grading",
        name="Hugging Face: jyesr/pokemon-tcg-grading",
        url="https://huggingface.co/datasets/jyesr/pokemon-tcg-grading",
        available_grades="Claimed 1–10, but documented as expected PSA grade if submitted, not actual PSA results",
        estimated_image_count="Dataset card: 14,900 rows shown, ~50,232 estimated; 17 GB; 20K+ front/back scans advertised",
        image_resolution="2400px × ~1430px",
        front_back="Yes (front and back scans)",
        label_quality="weak",
        license="Unknown. Dataset is gated (HTTP 401 without Hugging Face access). License cannot be confirmed until access is granted and the card is reviewed.",
        scraping_permission="official_dataset_download",
        robots_txt_url="https://huggingface.co/robots.txt",
        robots_notes="User-agent: * Allow: /. Official Hub download is the permitted channel.",
        terms_url="https://huggingface.co/terms",
        terms_notes=(
            "Hub hosting is not a license to the underlying Pokémon artwork or "
            "to any scraped third-party photos. Dataset license, if any, only "
            "covers rights the uploader actually holds."
        ),
        recommendation="conditional",
        collection_allowed=False,
        reason=(
            "Closest public ML-shaped corpus (high-res front/back). Labels are "
            "explicitly expected grades, not PSA certs — do not treat as "
            "authoritative. Do not download until the gated license is reviewed "
            "and confirmed to cover this research use. Modern-card bias noted "
            "on the card (collected 2026)."
        ),
        capture_type="raw",
        notes=[
            "If accessed later, assign grade_label_confidence=weak unless cert numbers are present.",
            "Useful as auxiliary condition diversity only after license clearance.",
        ],
    ),
    SourceRecord(
        id="hf_pacoalberola_psa_images",
        name="Hugging Face: pacoalberola/Poke-Grader-Dataset-Images-PSA",
        url="https://huggingface.co/datasets/pacoalberola/Poke-Grader-Dataset-Images-PSA",
        available_grades="Integer 1–10 plus half-grades mixed across PSA/CGC/BGS/ACE",
        estimated_image_count="3,156 labeled rows in grades.csv; 282 MB total",
        image_resolution="Not documented; marketplace listing photos (often slab shots)",
        front_back="Not paired in metadata; typically one listing photo per row",
        label_quality="strong",
        license="huggingface-hub-public-dataset",
        scraping_permission="official_dataset_download",
        robots_txt_url="https://huggingface.co/robots.txt",
        robots_notes="Hub download permitted by robots.txt. Collection uses huggingface_hub, not HTML scraping.",
        terms_url="https://huggingface.co/datasets/pacoalberola/Poke-Grader-Dataset-Images-PSA",
        terms_notes=(
            "No SPDX license on the dataset card. Chosen as the only public Hub "
            "dataset with structured PSA 1–10 image labels. Downloads go through "
            "the official Hub file API. Underlying listing photos may not be "
            "redistributable; keep this corpus internal."
        ),
        recommendation="conditional",
        collection_allowed=True,
        reason=(
            "Enabled: official Hugging Face dataset download (robots Allow: /). "
            "PSA-only rows (ebay_psa / pwcc_psa) with integer grades. Not a PSA "
            "cert API. Grade 1–2 are scarce. Typical shortest side ~300–480 px."
        ),
        notes=[
            "PSA-only counts ≈ 1=60, 2=66, 3=165, 4=139, 5=182, 6=234, 7=300, 8=472, 9=300, 10=321.",
            "Prefer PWCC files (often ~430–480 px short side) over eBay (~300 px).",
            "Do not scrape eBay or PWCC/Fanatics directly.",
        ],
    ),
    SourceRecord(
        id="hf_pacoalberola_defects",
        name="Hugging Face: pacoalberola/Poke-Grader-Defect-Dataset-2000cards-v2",
        url="https://huggingface.co/datasets/pacoalberola/Poke-Grader-Defect-Dataset-2000cards-v2",
        available_grades="Defect class labels, not PSA 1–10",
        estimated_image_count="~12.3k rows including augmentations",
        image_resolution="Small training crops (viewer samples ~224px class)",
        front_back="Not a paired slab dataset",
        label_quality="none",
        license="None published",
        scraping_permission="official_dataset_download",
        robots_txt_url="https://huggingface.co/robots.txt",
        robots_notes="Hub Allow: /",
        terms_url="https://huggingface.co/datasets/pacoalberola/Poke-Grader-Defect-Dataset-2000cards-v2",
        terms_notes="Augmented copies (aug_0, aug_1, …) are unsafe for defect learning if enhancement artifacts exist.",
        recommendation="not_recommended",
        collection_allowed=False,
        reason="Wrong task (defect classes / augmentations), no PSA grades, no license.",
        capture_type="unknown",
    ),
    SourceRecord(
        id="hf_lding101_pokemon_card_grades",
        name="Hugging Face: lding101/pokemon-card-grades",
        url="https://huggingface.co/datasets/lding101/pokemon-card-grades",
        available_grades="Unknown until gated access is granted",
        estimated_image_count="1,118 exported rows; 858 MB (implies relatively large files)",
        image_resolution="Unknown; 858 MB / 1118 ≈ 0.77 MB per row average",
        front_back="Unknown",
        label_quality="unknown",
        license="Gated. Must accept Hub conditions and review license before any use.",
        scraping_permission="official_dataset_download",
        robots_txt_url="https://huggingface.co/robots.txt",
        robots_notes="Hub Allow: /",
        terms_url="https://huggingface.co/datasets/lding101/pokemon-card-grades",
        terms_notes="Gated dataset: 'agree to share contact information to access'. Card text: exported from agreed label/crop pairs in a local SQLite database.",
        recommendation="conditional",
        collection_allowed=False,
        reason="Too small for the target, gated, license unread. Revisit only after accepting Hub terms and confirming label authority and rights.",
    ),
    SourceRecord(
        id="hf_rrhagentbiz_centering",
        name="Hugging Face: rrhagentbiz/pokemon-card-centering-measurements",
        url="https://huggingface.co/datasets/rrhagentbiz/pokemon-card-centering-measurements",
        available_grades="None (centering pass/fail vs PSA 9/10 windows, not actual grades)",
        estimated_image_count="0 images; 320 tabular rows",
        image_resolution="N/A",
        front_back="N/A",
        label_quality="none",
        license="CC-BY-4.0 (metadata only)",
        scraping_permission="official_dataset_download",
        robots_txt_url="https://huggingface.co/robots.txt",
        robots_notes="Hub Allow: /",
        terms_url="https://huggingface.co/datasets/rrhagentbiz/pokemon-card-centering-measurements",
        terms_notes="Compiled from eBay listing photos; CSV does not include the photos.",
        recommendation="not_recommended",
        collection_allowed=False,
        reason="No images and no professional grades. Optional reference for centering thresholds only.",
        capture_type="n_a",
    ),
    SourceRecord(
        id="hf_thefusion21_pokemoncards",
        name="Hugging Face / Kaggle catalog card image sets (TheFusion21, priyamchoksi, ellimaaac, pokemontcg.io)",
        url="https://huggingface.co/datasets/TheFusion21/PokemonCards",
        available_grades="None",
        estimated_image_count="10k–21k catalog renders",
        image_resolution="Official/hi-res catalog scans (typically 600px+)",
        front_back="Usually front only",
        label_quality="none",
        license="Pokémon Company / Nintendo / Creatures / GAME FREAK artwork. Dataset wrappers do not grant those rights.",
        scraping_permission="official_api",
        robots_txt_url="https://pokemontcg.io/robots.txt",
        robots_notes="pokemontcg.io publishes content-signals covering search / AI input / AI training. Use only the official Pokémon TCG API if collecting catalog metadata.",
        terms_url="https://docs.pokemontcg.io",
        terms_notes="Catalog images are stock/print images, not condition photographs.",
        recommendation="not_recommended",
        collection_allowed=False,
        reason="Stock/catalog images must be rejected for a condition model. Useful only later as negative examples or identity matching, with separate rights review.",
        capture_type="catalog",
    ),
    SourceRecord(
        id="github_psa_baseball_grades",
        name="GitHub: samsilverman/PSA-Baseball-Grades",
        url="https://github.com/samsilverman/PSA-Baseball-Grades",
        available_grades="PSA 1–10, 1,150 images each (11,500 total)",
        estimated_image_count="11,500",
        image_resolution="150×200 (below this pipeline's 500px minimum; padded/scaled)",
        front_back="Unknown / not designed as pairs",
        label_quality="weak",
        license="None listed",
        scraping_permission="prohibited",
        robots_txt_url="https://www.collectors.com/robots.txt",
        robots_notes="README states data was collected with ParseHub from Collectors.com.",
        terms_url="https://app.collectors.com/collectorsuseragreement",
        terms_notes="Collectors ToS prohibits scraping. Redistributing that scrape does not create a clean license.",
        recommendation="not_recommended",
        collection_allowed=False,
        reason="Wrong sport, too small, known bad labels/duplicates, below resolution floor, scraped from a prohibited source.",
        capture_type="slab",
    ),
    SourceRecord(
        id="github_crimsonthinker",
        name="GitHub: crimsonthinker/psa_pokemon_cards",
        url="https://github.com/crimsonthinker/psa_pokemon_cards",
        available_grades="Per-aspect scores (centering/corners/edges/surface), not necessarily official PSA certs",
        estimated_image_count="Repo size ~119 MB; images live under data/[id]/{front,back}.jpg if present in clone",
        image_resolution="README references 1680×3147 originals",
        front_back="Yes (front and back per id)",
        label_quality="unknown",
        license="None listed",
        scraping_permission="unknown",
        robots_txt_url="n/a",
        robots_notes="GitHub clone is not a license for the photographs.",
        terms_url="https://github.com/crimsonthinker/psa_pokemon_cards",
        terms_notes="No LICENSE file. Provenance of data/ images is undocumented.",
        recommendation="not_recommended",
        collection_allowed=False,
        reason="No license and no provenance. Do not ingest until the author documents rights and whether grades are actual PSA certs.",
        capture_type="unknown",
    ),
    SourceRecord(
        id="github_gotta_catch_em_all",
        name="GitHub: jonathan-rasmussen/gotta_catch_em_all (Queen's University SharePoint dumps)",
        url="https://github.com/jonathan-rasmussen/gotta_catch_em_all",
        available_grades="Claimed PSA; undocumented",
        estimated_image_count="Advertised 28.1 GB 'Original PSA Dataset' + 16.5 GB 'PWCC Dataset'",
        image_resolution="Unknown (large archives suggest high-res scans)",
        front_back="Unknown",
        label_quality="unknown",
        license="None. Hosted on personal Queen's University OneDrive links.",
        scraping_permission="prohibited",
        robots_txt_url="n/a",
        robots_notes="Named as PSA and PWCC dumps. PWCC/Fanatics and PSA both restrict automated harvesting.",
        terms_url="https://github.com/jonathan-rasmussen/gotta_catch_em_all",
        terms_notes="SharePoint links may expire. No rights statement.",
        recommendation="not_recommended",
        collection_allowed=False,
        reason="Likely unlicensed redistribution of PSA/PWCC images. Skip.",
    ),
    SourceRecord(
        id="heritage_auctions",
        name="Heritage Auctions",
        url="https://www.ha.com",
        available_grades="Lot titles often include PSA/CGC/BGS + cert",
        estimated_image_count="Large auction archive",
        image_resolution="Auction photography; often high, but lot-dependent",
        front_back="Often multiple lot photos",
        label_quality="strong",
        license="Heritage proprietary lot photography",
        scraping_permission="prohibited",
        robots_txt_url="https://www.ha.com/robots.txt",
        robots_notes=(
            "User-agent * Crawl-delay 15. Disallow cart, bid, invoice, wantlist, "
            "live, etc. Independent reports: DataDome returns 403 on most ha.com "
            "paths. Do not bypass."
        ),
        terms_url="https://www.ha.com",
        terms_notes="Auction houses typically prohibit scraping and reuse of lot images for competing products/datasets.",
        recommendation="not_recommended",
        collection_allowed=False,
        reason="Anti-bot protection plus typical auction ToS. Stop rather than evade. No public ML license.",
    ),
    SourceRecord(
        id="goldin",
        name="Goldin",
        url="https://goldin.co",
        available_grades="Auction lots with professional grades",
        estimated_image_count="Large",
        image_resolution="Auction photography",
        front_back="Often",
        label_quality="strong",
        license="Goldin proprietary",
        scraping_permission="prohibited",
        robots_txt_url="https://goldin.co/robots.txt",
        robots_notes="Disallow /account/, /api/, /assets/, /static/. Allow selected public lot paths. Disallow of /api/ means do not hit undocumented APIs.",
        terms_url="https://goldin.co",
        terms_notes="No public dataset license. Undocumented API is disallowed by robots.txt.",
        recommendation="not_recommended",
        collection_allowed=False,
        reason="robots.txt disallows /api/. No ML license. Skip.",
    ),
    SourceRecord(
        id="fanatics_collect",
        name="Fanatics Collect (formerly PWCC)",
        url="https://www.fanaticscollect.com",
        available_grades="PSA/BGS/CGC/SGC lots",
        estimated_image_count="Large",
        image_resolution="Marketplace/auction photography",
        front_back="Often",
        label_quality="strong",
        license="Fanatics Collect proprietary",
        scraping_permission="prohibited",
        robots_txt_url="https://www.fanaticscollect.com/robots.txt",
        robots_notes="Disallow /login, /join, /i-am-not-a-robot, /share/, email verify. Presence of /i-am-not-a-robot indicates active bot challenges.",
        terms_url="https://www.fanaticscollect.com",
        terms_notes="Third-party commercial scrapers exist; that does not make collection permitted.",
        recommendation="not_recommended",
        collection_allowed=False,
        reason="Bot challenges and no public license. Do not bypass /i-am-not-a-robot.",
    ),
    SourceRecord(
        id="cgc_website_and_dealer_api",
        name="CGC Cards cert lookup / CCG Dealer API",
        url="https://www.cgccards.com",
        available_grades="CGC scale (not PSA 1–10; mapping is lossy)",
        estimated_image_count="Large official holder images",
        image_resolution="Official holder photos when present",
        front_back="Yes when imaged",
        label_quality="authoritative",
        license="CGC/CCG owns compiled data and images (submission terms grant CGC commercialization rights).",
        scraping_permission="official_api",
        robots_txt_url="https://www.cgccards.com/robots.txt",
        robots_notes="user-agent * Allow: /. Public cert lookup is rate-limited ('search activity has exceeded our limits').",
        terms_url="https://www.cgccomics.com/legal/terms-of-use/",
        terms_notes=(
            "Website terms: personal, non-commercial viewing; do not use graphics "
            "separately from accompanying text. Dealer API is OAuth for dealers, "
            "not a public bulk-download grant."
        ),
        recommendation="not_recommended",
        collection_allowed=False,
        reason=(
            "Authoritative CGC labels, but (1) not PSA, (2) website reuse is "
            "personal-use only, (3) Dealer API requires dealer credentials and "
            "does not by itself authorize an ML corpus. Skip unless CGC grants "
            "written research rights."
        ),
        capture_type="slab",
    ),
    SourceRecord(
        id="beckett_bgs",
        name="Beckett / BGS",
        url="https://www.beckett.com",
        available_grades="BGS 1–10 with subgrades",
        estimated_image_count="Large",
        image_resolution="Official when present",
        front_back="Varies",
        label_quality="authoritative",
        license="Beckett owns Data and Images (ToS assignment).",
        scraping_permission="prohibited",
        robots_txt_url="https://www.beckett.com/robots.txt",
        robots_notes="HTTP 403 when fetching robots.txt during discovery (2026-08-29). Treat as blocked automated access.",
        terms_url="https://www.beckett.com/tos",
        terms_notes="Beckett claims ownership of submission data and images and may exploit them commercially.",
        recommendation="not_recommended",
        collection_allowed=False,
        reason="Wrong grader for a PSA-only target; robots.txt fetch was blocked; ToS does not permit bulk reuse.",
    ),
    SourceRecord(
        id="roboflow_find_card_in_psa",
        name="Roboflow Universe: find-card-in-psa (object detection)",
        url="https://universe.roboflow.com/findpokemoncard/find-card-in-psa",
        available_grades="None (bounding boxes for card-in-slab detection)",
        estimated_image_count="Small detection set (not a grade corpus)",
        image_resolution="Training resolution; typically resized",
        front_back="N/A",
        label_quality="none",
        license="Roboflow Universe datasets are commonly CC BY 4.0; confirm on the project page before download.",
        scraping_permission="official_dataset_download",
        robots_txt_url="https://universe.roboflow.com/robots.txt",
        robots_notes="Disallow dataset image browse/download paths for crawlers. Use the official Roboflow export/API, not HTML scraping.",
        terms_url="https://roboflow.com/terms",
        terms_notes="Download via Roboflow tools after accepting project license.",
        recommendation="conditional",
        collection_allowed=False,
        reason="Useful later as cropper supervision, not as PSA grade labels. Download only via official export after confirming CC-BY (or other) license.",
        capture_type="slab",
    ),
    SourceRecord(
        id="roboflow_card_grader",
        name="Roboflow Universe: Group 6 card-grader",
        url="https://universe.roboflow.com/group-6-major-project/card-grader",
        available_grades="Defect classes (edge wear, scratch, corner wear), not PSA 1–10",
        estimated_image_count="1,256 images (v4 cited in model card)",
        image_resolution="Training resolution",
        front_back="N/A",
        label_quality="none",
        license="Confirm on project page (Universe default is often CC BY 4.0).",
        scraping_permission="official_dataset_download",
        robots_txt_url="https://universe.roboflow.com/robots.txt",
        robots_notes="Do not scrape /dataset/*/download. Use official export.",
        terms_url="https://roboflow.com/terms",
        terms_notes="Academic group project, 2022.",
        recommendation="conditional",
        collection_allowed=False,
        reason="Too small and wrong labels for the PSA 1–10 goal. Optional cropper/defect auxiliary after license check.",
        capture_type="raw",
    ),
    SourceRecord(
        id="wikimedia_commons",
        name="Wikimedia Commons Pokémon TCG scans",
        url="https://commons.wikimedia.org",
        available_grades="Almost never professionally graded",
        estimated_image_count="Low hundreds of card scans at most, mixed licenses",
        image_resolution="Variable",
        front_back="Rarely paired",
        label_quality="none",
        license="Per-file (CC-BY-SA, public domain, etc.). Pokémon artwork rights still sit with TPC/Nintendo.",
        scraping_permission="official_api",
        robots_txt_url="https://commons.wikimedia.org/robots.txt",
        robots_notes="MediaWiki API is the permitted access method.",
        terms_url="https://commons.wikimedia.org/wiki/Commons:Licensing",
        terms_notes="Must honor each file's license and attribution. Commons license does not waive Pokémon IP.",
        recommendation="not_recommended",
        collection_allowed=False,
        reason="Cannot reach 2,000 examples per PSA grade. No authoritative grades. Optional identity/diversity supplement only.",
        capture_type="catalog",
    ),
    SourceRecord(
        id="zenodo_tcg_price_rarity",
        name="Zenodo: Pokémon TCG price/rarity review dataset (10.5281/zenodo.15697369)",
        url="https://doi.org/10.5281/zenodo.15697369",
        available_grades="None",
        estimated_image_count="Not a graded-image corpus",
        image_resolution="N/A",
        front_back="N/A",
        label_quality="none",
        license="Check Zenodo record (academic dataset; likely tabular).",
        scraping_permission="official_dataset_download",
        robots_txt_url="https://zenodo.org/robots.txt",
        robots_notes="Zenodo allows dataset download of published records.",
        terms_url="https://doi.org/10.5281/zenodo.15697369",
        terms_notes="Binus University 2025 record on factors affecting price and rarity.",
        recommendation="not_recommended",
        collection_allowed=False,
        reason="Wrong data type for a condition/grade vision dataset.",
        capture_type="n_a",
    ),
    SourceRecord(
        id="psa_written_research_license",
        name="PSA / Collectors written research or commercial data license (not yet obtained)",
        url="https://www.psacard.com/publicapi",
        available_grades="PSA 1–10 with cert metadata",
        estimated_image_count="Only path that could legally approach 20k–50k official slab pairs",
        image_resolution="Official",
        front_back="Yes when imaged",
        label_quality="authoritative",
        license="Would be defined by the negotiated agreement",
        scraping_permission="official_api",
        robots_txt_url="https://www.psacard.com/robots.txt",
        robots_notes="N/A until a license exists.",
        terms_url="https://www.psacard.com/termsandconditions",
        terms_notes="Collectors ToS already says written authorization is required to exploit Content.",
        recommendation="recommended",
        collection_allowed=False,
        reason=(
            "Recommended as the primary legal path for authoritative slab "
            "supervision. Do not collect until a signed agreement exists. "
            "collection_allowed stays False until that agreement is filed."
        ),
        notes=[
            "Ask for: Pokémon TCG only; balanced sample across grades 1–10; front+back; cert numbers; permission to train a non-generative condition model; no public redistribution of raw PSA images.",
        ],
    ),
    SourceRecord(
        id="user_contributed_raw_psa",
        name="User-contributed raw photos with later PSA outcomes (Phase 2 schema)",
        url="internal://user-contributed",
        available_grades="Actual PSA 1–10 once the same physical card returns from PSA",
        estimated_image_count="Starts at zero; highest long-term value per example",
        image_resolution="Controlled capture (target ≥1000 px short side)",
        front_back="Required",
        label_quality="authoritative",
        license="Contributor license + Pokémon IP still applies to card artwork; grades are facts about a physical object",
        scraping_permission="n_a",
        robots_txt_url="n/a",
        robots_notes="No web collection.",
        terms_url="n/a",
        terms_notes="Need a contributor agreement covering training use, withdrawal, and no redistribution of identity-bearing photos if any.",
        recommendation="recommended",
        collection_allowed=False,
        reason=(
            "Recommended as the highest-value dataset for a raw-card grader. "
            "Not a scrape source. Enable only after contributor terms and app "
            "intake exist. Schema is prepared now."
        ),
        capture_type="raw",
        notes=[
            "Paired fields: raw_front_images, raw_back_images, predicted_grade, submitted_to_psa, psa_cert, actual_psa_grade.",
            "Never mix unlabeled raw photos into the PSA-supervised training split.",
        ],
    ),
    SourceRecord(
        id="manual_licensed_import",
        name="Manual import of an already-licensed archive",
        url="internal://manual-import",
        available_grades="Whatever the archive contains",
        estimated_image_count="Depends on the archive",
        image_resolution="Depends on the archive",
        front_back="Depends on the archive",
        label_quality="unknown",
        license="Must be supplied per import (SPDX or contract id)",
        scraping_permission="n_a",
        robots_txt_url="n/a",
        robots_notes="Offline import only.",
        terms_url="n/a",
        terms_notes="Operator must attach license text and refuse import if missing.",
        recommendation="conditional",
        collection_allowed=False,
        reason="Safe adapter for a future licensed dump. Disabled until an archive with documented rights is provided.",
        capture_type="unknown",
    ),
)


def source_by_id(source_id: str) -> SourceRecord:
    for src in SOURCES:
        if src.id == source_id:
            return src
    raise KeyError(f"Unknown source id: {source_id}")


def collection_enabled_sources() -> list[SourceRecord]:
    return [s for s in SOURCES if s.collection_allowed]

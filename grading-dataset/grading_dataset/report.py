"""Render sources_report.md and sources.json from the catalog."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

from grading_dataset.catalog import SOURCES, SourceRecord

USER_AGENT = "TCGTracker-grading-dataset/0.1 (source discovery; robots.txt only)"


def rec_status(source: SourceRecord) -> str:
    if source.recommendation == "recommended":
        return "Recommended (not collectable until rights exist)"
    if source.recommendation == "conditional":
        return "Conditional — do not collect yet"
    return "Not recommended — skip"


def render_source(source: SourceRecord) -> str:
    return f"""## {source.name}

- **Source id:** `{source.id}`
- **URL:** {source.url}
- **Available grades:** {source.available_grades}
- **Estimated image count:** {source.estimated_image_count}
- **Image resolution:** {source.image_resolution}
- **Front/back availability:** {source.front_back}
- **Label quality:** {source.label_quality}
- **License / terms:** {source.license}
- **Scraping / API permission:** `{source.scraping_permission}`
- **robots.txt:** {source.robots_txt_url}
  - {source.robots_notes}
- **Terms:** {source.terms_url}
  - {source.terms_notes}
- **Capture type:** `{source.capture_type}`
- **collection_allowed:** `{source.collection_allowed}`
- **Recommendation:** {rec_status(source)}
- **Reason:** {source.reason}
""" + (
        "\n".join(f"- Note: {note}" for note in source.notes) + "\n"
        if source.notes
        else ""
    )


def render_report(checked_at: str, robots_refresh: dict[str, str] | None = None) -> str:
    recommended = [s for s in SOURCES if s.recommendation == "recommended"]
    conditional = [s for s in SOURCES if s.recommendation == "conditional"]
    skipped = [s for s in SOURCES if s.recommendation == "not_recommended"]
    enabled = [s for s in SOURCES if s.collection_allowed]
    parts = [
        "# Graded Pokémon card dataset — Phase 1 source report",
        "",
        f"_Discovery date: {checked_at}_",
        "",
        "## Executive finding",
        "",
        "There is **no currently collectable** source that is simultaneously:",
        "",
        "1. legally reusable for this ML/research purpose,",
        "2. labeled with **authoritative PSA grades**,",
        "3. high-resolution enough for defect inspection, and",
        "4. large enough to hit 2,000–5,000 examples per grade 1–10.",
        "",
        f"**Sources with `collection_allowed=true`:** {len(enabled)} (must stay zero until you approve).",
        "",
        "Bulk download is **not** starting. This report is the stop point for Phase 1.",
        "",
        "## What would actually train a raw-card grader",
        "",
        "Slab photos of already-graded cards are **professional-grade supervision**, not a substitute for raw-card photography. A model trained `slab image → PSA grade` will pick up holder, label, and studio lighting cues. The eventual high-value set is:",
        "",
        "`raw front + raw back` of a physical card **before** submission, later joined to `actual_psa_grade` via `psa_cert`.",
        "",
        "That dataset does not exist publicly. The pipeline schema is ready for it.",
        "",
        "## Legal constraints that ruled out the obvious corpora",
        "",
        "- **Collectors / PSA website:** User Agreement bans robots, scrapers, and data mining of Content except through means purposely made available. PSA owns submission data and images.",
        "- **PSA Public API:** Official cert lookup with grades and image URLs, but the End User Agreement is account-gated and does **not** obviously grant a redistributable training corpus. Lookup is by cert number only (not a catalog dump).",
        "- **eBay HTML:** robots.txt and User Agreement prohibit automated access except search engines.",
        "- **eBay APIs:** Permitted integration path, but the June 2025 API License Agreement restricts using Restricted API data to train AI, and listing titles are **weak** grade labels.",
        "- **Heritage / Goldin / Fanatics Collect:** Auction photography with anti-bot systems (Cloudflare, DataDome, `/i-am-not-a-robot`). This pipeline will **stop** on 401/403/CAPTCHA and will not rotate proxies or fingerprints.",
        "- **Third-party Hugging Face / GitHub dumps of eBay, PSA, or PWCC photos:** Hosting on the Hub is not a license chain. Several have **no license**, inferred marketplace grades, or documented scrape provenance.",
        "- **Pokémon artwork:** Card faces remain copyright of The Pokémon Company / Nintendo / Creatures / GAME FREAK even when a dataset uploader slaps CC-BY on a repo.",
        "",
        "This is not legal advice. It is an operational refusal to collect from sources that fail the project's own rules.",
        "",
        "## Recommended next actions (no images yet)",
        "",
        "1. **Ask Collectors/PSA** for a written research license: Pokémon TCG only, grades 1–10 balanced, front+back official images, cert numbers, permission to train a **non-generative** condition model, no public redistribution of raw PSA pixels.",
        "2. **Build contributor intake** (Phase 2 schema already in code): users photograph raw cards, optionally submit to PSA, return cert + grade.",
        "3. If you obtain Hugging Face access to `jyesr/pokemon-tcg-grading`, **read the license**. Even then, the card states grades are *expected* PSA grades, not certs — keep them out of the authoritative training split.",
        "4. Do **not** scrape PSA, Collectors, eBay, PWCC/Fanatics, Heritage, Goldin, Beckett, or CGC HTML.",
        "",
        "## Live collection table (Phase 1)",
        "",
        "| Grade | Valid examples | Front+Back | Front only | Rejected |",
        "| ---: | ---: | ---: | ---: | ---: |",
    ]
    for g in range(1, 11):
        parts.append(f"| {g} | 0 | 0 | 0 | 0 |")
    parts += [
        "",
        "## Summary counts",
        "",
        f"- Recommended (legal path, still not collectable): **{len(recommended)}**",
        f"- Conditional (review license/EUA first): **{len(conditional)}**",
        f"- Not recommended / skip: **{len(skipped)}**",
        "",
        "---",
        "",
        "# Recommended",
        "",
    ]
    for source in recommended:
        parts.append(render_source(source))
        parts.append("")
    parts += ["---", "", "# Conditional", ""]
    for source in conditional:
        parts.append(render_source(source))
        parts.append("")
    parts += ["---", "", "# Not recommended — skip", ""]
    for source in skipped:
        parts.append(render_source(source))
        parts.append("")
    if robots_refresh:
        parts += [
            "---",
            "",
            "## robots.txt refresh log",
            "",
        ]
        for url, status in robots_refresh.items():
            parts.append(f"- `{url}` → {status}")
        parts.append("")
    parts += [
        "---",
        "",
        "## Phase 2 / 3 / 4 status",
        "",
        "- **Phase 2 (pilot, 100 per grade):** blocked until at least one source is approved and `collection_allowed` is set.",
        "- **Phase 3 (full 2k–5k per grade):** not started.",
        "- **Phase 4 (clean/split):** code is ready; no data to split.",
        "",
    ]
    return "\n".join(parts)


def write_outputs(root: Path, refresh_robots: bool = False) -> dict[str, Path]:
    checked_at = datetime.now(timezone.utc).date().isoformat()
    robots_refresh: dict[str, str] = {}
    if refresh_robots:
        seen: set[str] = set()
        for source in SOURCES:
            url = source.robots_txt_url
            if not url.startswith("http") or url in seen:
                continue
            seen.add(url)
            try:
                req = Request(url, headers={"User-Agent": USER_AGENT})
                with urlopen(req, timeout=20) as resp:
                    robots_refresh[url] = f"HTTP {resp.status}, {len(resp.read(8000))} bytes (truncated read)"
            except Exception as exc:  # noqa: BLE001 — discovery must record failures
                robots_refresh[url] = f"error: {exc}"
    report = render_report(checked_at, robots_refresh or None)
    report_path = root / "sources_report.md"
    json_path = root / "sources.json"
    report_path.write_text(report, encoding="utf-8")
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "collection_enabled_count": sum(1 for s in SOURCES if s.collection_allowed),
        "sources": [s.to_dict() for s in SOURCES],
        "robots_refresh": robots_refresh,
    }
    json_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    return {"sources_report.md": report_path, "sources.json": json_path}

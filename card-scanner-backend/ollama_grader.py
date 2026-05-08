"""
LLM-based card grading using local Ollama models.

Uses Gemma 3 4B (or other vision models) for visual reasoning about card condition.
Completely free - runs locally on your hardware.
"""

from __future__ import annotations

import base64
import json
import re
import time
from dataclasses import dataclass
from io import BytesIO
from typing import Any

import ollama
from PIL import Image


# ── Configuration ──────────────────────────────────────────────────────────────

OLLAMA_MODEL = "gemma3:4b"  # Default model, can be changed

# PSA grading thresholds for reference in prompts
PSA_THRESHOLDS = {
    "front_centering": {
        10: "55/45 or better",
        9: "60/40",
        8: "65/35",
        7: "70/30",
        6: "80/20",
    },
    "back_centering": {
        10: "75/25 or better",
        9: "90/10",
        8: "90/10",
        7: "90/10",
        6: "90/10",
    },
}

# ── Subgrade Prompts ───────────────────────────────────────────────────────────

SUBGRADE_PROMPTS = {
    "centering_front": """Grade ONLY the centering of the FRONT of this Pokemon trading card.

PERSPECTIVE CORRECTION: Before assessing centering, identify the camera angle. If edges converge (trapezoid instead of rectangle), the card is tilted. Mentally project to flat top-down view first. Do NOT penalize for camera angle distortion.

TECHNIQUE: Compare left vs right borders, then top vs bottom. Estimate ratio as percentage split (e.g. 55/45 means left border is 55% of total horizontal width).

PSA FRONT CENTERING THRESHOLDS:
- 10 (Gem Mint): 55/45 or better
- 9 (Mint): 60/40
- 8 (NM-MT): 65/35
- 7 (NM): 70/30
- 6 (EX-MT): 80/20

If photo angle is steep or card is heavily tilted, set confidence below 0.5.

Respond ONLY with valid JSON (no markdown):
{"score": <number 1-10>, "confidence": <number 0-1>, "detail": "<one sentence>", "lr": "<left/right ratio e.g. 55/45>", "tb": "<top/bottom ratio e.g. 52/48>"}""",

    "centering_back": """Grade ONLY the centering of the BACK of this Pokemon trading card.

PERSPECTIVE CORRECTION: Before assessing centering, identify the camera angle. If edges converge (trapezoid instead of rectangle), the card is tilted. Mentally project to flat top-down view first. Do NOT penalize for camera angle distortion.

TECHNIQUE: Compare left vs right borders, then top vs bottom. Estimate ratio as percentage split. Back centering is often the grade limiter.

PSA BACK CENTERING THRESHOLDS (more lenient than front):
- 10 (Gem Mint): 75/25 or better
- 9 (Mint): 90/10
- 8 (NM-MT): 90/10
- 7 (NM): 90/10
- 6 (EX-MT): 90/10

If photo angle is steep or card is heavily tilted, set confidence below 0.5.

Respond ONLY with valid JSON (no markdown):
{"score": <number 1-10>, "confidence": <number 0-1>, "detail": "<one sentence>", "lr": "<left/right ratio e.g. 55/45>", "tb": "<top/bottom ratio e.g. 52/48>"}""",

    "corners_front": """Grade ONLY the corners of the FRONT of this Pokemon trading card. Examine each of the 4 corners individually: top-left, top-right, bottom-left, bottom-right.

WHAT TO LOOK FOR per corner:
- Whitening: white fibers visible along the corner edge (most common defect)
- Rounding: corner lost its sharp point, appears soft or curved
- Dings/dents: physical impact marks
- Fuzzing: frayed edge fibers at the corner point

PSA CORNER THRESHOLDS:
- 10 (Gem Mint): All 4 corners sharp and clean, no whitening under magnification
- 9 (Mint): Corners sharp, may have one tiny spot of whitening only visible under magnification
- 8 (NM-MT): Minor whitening on 1-2 corners, still sharp points
- 7 (NM): Slight whitening or softness on 2-3 corners
- 6 (EX-MT): Noticeable whitening or slight rounding on multiple corners

DARK-BORDERED CARDS: Whitening is more visible and more harshly penalized on dark/black borders.

If photo lacks close-up detail, note which corners you can and cannot assess clearly, and set confidence accordingly.

Respond ONLY with valid JSON (no markdown):
{"score": <number 1-10>, "confidence": <number 0-1>, "detail": "<one sentence: condition of worst corner(s), name which corners are affected>"}""",

    "corners_back": """Grade ONLY the corners of the BACK of this Pokemon trading card. Examine each of the 4 corners individually: top-left, top-right, bottom-left, bottom-right.

WHAT TO LOOK FOR per corner:
- Whitening: white fibers visible along the corner edge (most common defect on backs)
- Rounding: corner lost its sharp point, appears soft or curved
- Dings/dents: physical impact marks
- Fuzzing: frayed edge fibers at the corner point

Back corners often show MORE wear than front corners — cards stored in sleeves protect the front while the back contacts the sleeve directly.

PSA CORNER THRESHOLDS:
- 10 (Gem Mint): All 4 corners sharp and clean, no whitening under magnification
- 9 (Mint): Corners sharp, may have one tiny spot of whitening only visible under magnification
- 8 (NM-MT): Minor whitening on 1-2 corners, still sharp points
- 7 (NM): Slight whitening or softness on 2-3 corners
- 6 (EX-MT): Noticeable whitening or slight rounding on multiple corners

If photo lacks close-up detail, note which corners you can and cannot assess clearly, and set confidence accordingly.

Respond ONLY with valid JSON (no markdown):
{"score": <number 1-10>, "confidence": <number 0-1>, "detail": "<one sentence: condition of worst corner(s), name which corners are affected>"}""",

    "edges_front": """Grade ONLY the edges of the FRONT of this Pokemon trading card. Examine each of the 4 edges individually: top, bottom, left, right.

WHAT TO LOOK FOR per edge:
- Whitening: white line along the edge where color has worn away
- Chipping: small chips or flakes missing from the edge
- Nicks: tiny cuts or indentations along the edge
- Roughness: uneven or jagged edge surface
- Peeling: cardstock layers separating along the edge

PSA EDGE THRESHOLDS:
- 10 (Gem Mint): All edges clean and smooth, no whitening or wear
- 9 (Mint): Edges clean, one minor spot of whitening only visible under magnification
- 8 (NM-MT): Minor whitening on 1-2 edges, no chipping
- 7 (NM): Light whitening along 2+ edges, or one small chip
- 6 (EX-MT): Noticeable whitening on multiple edges, minor chipping possible

DARK-BORDERED CARDS: Edge whitening is far more visible against dark/black card borders. Apply stricter standards.

If photo lacks close-up detail, note which edges you can assess and set confidence accordingly.

Respond ONLY with valid JSON (no markdown):
{"score": <number 1-10>, "confidence": <number 0-1>, "detail": "<one sentence: condition of worst edge(s), name which edges are affected>"}""",

    "edges_back": """Grade ONLY the edges of the BACK of this Pokemon trading card. Examine each of the 4 edges individually: top, bottom, left, right.

WHAT TO LOOK FOR per edge:
- Whitening: white line along the edge where color has worn away
- Chipping: small chips or flakes missing from the edge
- Nicks: tiny cuts or indentations along the edge
- Roughness: uneven or jagged edge surface
- Peeling: cardstock layers separating along the edge

Back edges typically show MORE wear than front edges. The standard Pokemon card back has a blue border where whitening is clearly visible.

PSA EDGE THRESHOLDS:
- 10 (Gem Mint): All edges clean and smooth, no whitening or wear
- 9 (Mint): Edges clean, one minor spot of whitening only visible under magnification
- 8 (NM-MT): Minor whitening on 1-2 edges, no chipping
- 7 (NM): Light whitening along 2+ edges, or one small chip
- 6 (EX-MT): Noticeable whitening on multiple edges, minor chipping possible

If photo lacks close-up detail, note which edges you can assess and set confidence accordingly.

Respond ONLY with valid JSON (no markdown):
{"score": <number 1-10>, "confidence": <number 0-1>, "detail": "<one sentence: condition of worst edge(s), name which edges are affected>"}""",

    "surface_front": """Grade ONLY the surface of the FRONT of this Pokemon trading card. Assess the entire printable area including artwork and borders.

WHAT TO LOOK FOR:
- Scratches: linear marks across the surface, often visible when light catches them
- Print lines: factory printing defects, thin lines running through the card
- Ink spots/blotches: spots of excess ink or missing ink
- Dents/indentations: depressions in the cardstock visible as shadows
- Holo wear/scratching: wear patterns on holographic/foil areas
- Surface contamination: fingerprints, residue, sticker marks
- Creasing: any crease, even minor, severely limits grade (PSA 5 max for crease <1 inch)

PSA SURFACE THRESHOLDS:
- 10 (Gem Mint): Surface immaculate, no defects visible even under magnification
- 9 (Mint): Surface clean, one minor print imperfection allowed if not immediately noticeable
- 8 (NM-MT): Minor surface wear or one small print line, no scratches
- 7 (NM): Light surface wear, minor print defects, or one faint scratch
- 6 (EX-MT): Noticeable surface wear, light scratches, or print defects

HOLOGRAPHIC/FOIL CARDS: Holo surfaces reflect light differently at various angles. Glare may hide real scratches. Do NOT assume clean surface just because glare obscures it.

PHOTO QUALITY: Listing photos are often low-resolution or poorly lit. Surface defects are hardest to detect from photos. If image quality prevents confident assessment, set confidence below 0.5.

Respond ONLY with valid JSON (no markdown):
{"score": <number 1-10>, "confidence": <number 0-1>, "detail": "<one sentence: specific defects found or clean assessment, note if holo/glare limits visibility>"}""",

    "surface_back": """Grade ONLY the surface of the BACK of this Pokemon trading card. Assess the entire back surface.

WHAT TO LOOK FOR:
- Scratches: linear marks across the surface, common from sleeve contact
- Whitening/scuffing: surface wear showing lighter patches on the blue Pokemon card back
- Print lines: factory printing defects, thin lines running through the card
- Dents/indentations: depressions in the cardstock visible as shadows
- Surface contamination: fingerprints, residue, sticker marks
- Creasing: any crease, even minor, severely limits grade (PSA 5 max for crease <1 inch)

The standard Pokemon card back is uniform blue with a Poke Ball design — surface defects are often easier to spot on this consistent pattern.

PSA SURFACE THRESHOLDS:
- 10 (Gem Mint): Surface immaculate, no defects visible even under magnification
- 9 (Mint): Surface clean, one minor imperfection allowed if not immediately noticeable
- 8 (NM-MT): Minor surface wear or scuffing, no scratches
- 7 (NM): Light surface wear, minor scuffing, or one faint scratch
- 6 (EX-MT): Noticeable surface wear, light scratches, or whitening patches

PHOTO QUALITY: Listing photos are often low-resolution or poorly lit. If image quality prevents confident assessment, set confidence below 0.5.

Respond ONLY with valid JSON (no markdown):
{"score": <number 1-10>, "confidence": <number 0-1>, "detail": "<one sentence: specific defects found or clean assessment>"}""",
}

# ── Data Classes ───────────────────────────────────────────────────────────────

@dataclass
class SubgradeResult:
    score: float
    confidence: float
    detail: str
    lr: str | None = None
    tb: str | None = None
    provider: str = "ollama"
    model: str = OLLAMA_MODEL
    tokens_used: int = 0


@dataclass
class GradingResult:
    overall: float
    centering: float
    corners: float
    edges: float
    surface: float
    confidence: float
    notes: str
    limitations: str
    subgrade_details: dict[str, SubgradeResult]
    front_overall: float
    back_overall: float
    grade_distribution: dict[str, int]
    provider: str = "ollama"
    model: str = OLLAMA_MODEL
    processing_time_ms: int = 0


# ── Helper Functions ───────────────────────────────────────────────────────────

def parse_json_response(text: str) -> dict[str, Any] | None:
    """Parse JSON from LLM response, handling markdown fences and extra text."""
    if not text:
        return None

    # Remove markdown code fences
    text = re.sub(r'```(?:json)?\s*', '', text)
    text = re.sub(r'```', '', text)

    # Try each JSON object, preferring the first valid one
    # (handles multiple JSON blocks, stray braces, truncated output)
    depth = 0
    start = -1
    for i, ch in enumerate(text):
        if ch == '{':
            if depth == 0:
                start = i
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0 and start >= 0:
                json_str = text[start:i + 1]
                try:
                    return json.loads(json_str)
                except json.JSONDecodeError:
                    start = -1
                    continue

    # Fallback: try find/rfind as last resort
    start = text.find('{')
    end = text.rfind('}')
    if start >= 0 and end > start:
        json_str = text[start:end + 1]
        try:
            return json.loads(json_str)
        except json.JSONDecodeError:
            pass

    return None


def clamp(value: float, min_val: float, max_val: float) -> float:
    """Clamp value between min and max."""
    return max(min_val, min(max_val, value))


def compute_grade_distribution(overall: float, confidence: float) -> dict[str, int]:
    """Compute grade probability distribution based on overall grade and confidence."""
    grades = [10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5, 6, 5.5, 5]

    # Find closest grade
    idx = min(range(len(grades)), key=lambda i: abs(grades[i] - overall))
    closest = grades[idx]

    conf = clamp(confidence, 0.3, 1.0)
    primary_pct = round(conf * 60 + 20)
    remaining = 100 - primary_pct

    dist = {str(closest): primary_pct}

    above = grades[idx - 1] if idx > 0 else None
    below = grades[idx + 1] if idx < len(grades) - 1 else None

    if above and below:
        above_pct = round(remaining * 0.35)
        dist[str(above)] = above_pct
        dist[str(below)] = remaining - above_pct
    elif above:
        dist[str(above)] = remaining
    elif below:
        dist[str(below)] = remaining

    return dist


def round_grade(raw: float) -> float:
    """Round grade to nearest 0.5 increment following PSA conventions."""
    frac = raw - int(raw)
    if frac < 0.25:
        return float(int(raw))
    elif frac < 0.75:
        return float(int(raw)) + 0.5
    else:
        return float(int(raw) + 1)


# ── Ollama Grading Functions ──────────────────────────────────────────────────

def encode_image_to_base64(image: Image.Image) -> str:
    """Encode PIL Image to base64 string for Ollama."""
    buffer = BytesIO()
    image.save(buffer, format="JPEG", quality=90)
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


def grade_subgrade(
    image: Image.Image,
    subgrade_type: str,
    model: str = OLLAMA_MODEL,
) -> SubgradeResult | None:
    """
    Grade a single subgrade using Ollama vision model.

    Args:
        image: PIL Image of the card (full card or corner crop)
        subgrade_type: One of the SUBGRADE_PROMPTS keys
        model: Ollama model to use

    Returns:
        SubgradeResult or None if grading fails
    """
    if subgrade_type not in SUBGRADE_PROMPTS:
        return None

    prompt = SUBGRADE_PROMPTS[subgrade_type]
    image_b64 = encode_image_to_base64(image)

    try:
        start_time = time.time()

        response = ollama.chat(
            model=model,
            messages=[
                {
                    "role": "user",
                    "content": prompt,
                    "images": [image_b64],
                }
            ],
        )

        elapsed_ms = int((time.time() - start_time) * 1000)
        response_text = response.get("message", {}).get("content", "")

        # Parse response
        parsed = parse_json_response(response_text)
        if not parsed:
            print(f"[ollama] Failed to parse response for {subgrade_type}: {response_text[:200]}")
            # Retry once with explicit instruction to return valid JSON
            try:
                retry_response = ollama.chat(
                    model=model,
                    messages=[
                        {
                            "role": "user",
                            "content": "You MUST respond with ONLY valid JSON. No markdown, no explanation.\n\n" + prompt,
                            "images": [image_b64],
                        }
                    ],
                )
                response_text = retry_response.get("message", {}).get("content", "")
                parsed = parse_json_response(response_text)
            except Exception as e2:
                print(f"[ollama] Retry also failed for {subgrade_type}: {e2}")
        if not parsed:
            print(f"[ollama] All attempts failed for {subgrade_type}")
            return None

        # Extract and validate fields
        score = clamp(float(parsed.get("score", 5)), 1.0, 10.0)
        confidence = clamp(float(parsed.get("confidence", 0.5)), 0.0, 1.0)
        detail = str(parsed.get("detail", ""))
        lr = parsed.get("lr")
        tb = parsed.get("tb")

        # Get token usage if available
        tokens_used = 0
        if "eval_count" in response:
            tokens_used = response["eval_count"]

        return SubgradeResult(
            score=score,
            confidence=confidence,
            detail=detail,
            lr=lr,
            tb=tb,
            model=model,
            tokens_used=tokens_used,
        )

    except Exception as e:
        print(f"[ollama] Error grading {subgrade_type}: {e}")
        return None


def grade_card_with_ollama(
    front_image: Image.Image,
    back_image: Image.Image | None = None,
    model: str = OLLAMA_MODEL,
    centering_hint: dict[str, str] | None = None,
) -> GradingResult | None:
    """
    Grade a card using Ollama vision model with 8-subgrade analysis.

    Args:
        front_image: PIL Image of card front
        back_image: Optional PIL Image of card back
        model: Ollama model to use
        centering_hint: Optional user-measured centering ratios

    Returns:
        GradingResult or None if grading fails
    """
    start_time = time.time()
    has_back = back_image is not None

    # Prepare subgrade tasks
    subgrade_tasks = [
        ("centering_front", front_image),
        ("corners_front", front_image),
        ("edges_front", front_image),
        ("surface_front", front_image),
    ]

    if has_back:
        subgrade_tasks.extend([
            ("centering_back", back_image),
            ("corners_back", back_image),
            ("edges_back", back_image),
            ("surface_back", back_image),
        ])

    # Grade all subgrades
    subgrade_results: dict[str, SubgradeResult] = {}
    total_tokens = 0

    for subgrade_type, image in subgrade_tasks:
        result = grade_subgrade(image, subgrade_type, model)
        if result:
            subgrade_results[subgrade_type] = result
            total_tokens += result.tokens_used
        else:
            # If a required subgrade fails, try to continue with defaults
            print(f"[ollama] WARNING: {subgrade_type} failed, defaulting to 5.0")
            subgrade_results[subgrade_type] = SubgradeResult(
                score=5.0,
                confidence=0.3,
                detail="Unable to assess - using default score",
            )

    # Calculate front and back averages
    front_keys = ["centering_front", "corners_front", "edges_front", "surface_front"]
    back_keys = ["centering_back", "corners_back", "edges_back", "surface_back"]

    front_scores = [subgrade_results[k].score for k in front_keys if k in subgrade_results]
    front_avg = sum(front_scores) / len(front_scores) if front_scores else 5.0

    if has_back:
        back_scores = [subgrade_results[k].score for k in back_keys if k in subgrade_results]
        back_avg = sum(back_scores) / len(back_scores) if back_scores else front_avg
    else:
        back_avg = front_avg

    # Overall = 60% front + 40% back, capped at lowest + 1
    raw_overall = (front_avg * 0.60) + (back_avg * 0.40)
    lowest_score = min(r.score for r in subgrade_results.values())
    overall = round_grade(min(raw_overall, lowest_score + 1))

    # Average confidence
    confidences = [r.confidence for r in subgrade_results.values()]
    avg_confidence = sum(confidences) / len(confidences) if confidences else 0.5

    # Determine grade limiter
    lowest_key = min(subgrade_results.keys(), key=lambda k: subgrade_results[k].score)
    notes = f"Grade limiter: {lowest_key} ({subgrade_results[lowest_key].score})"

    if not has_back:
        limitations = "Back not provided — back subgrades estimated from front."
    else:
        limitations = ""

    # Build result
    elapsed_ms = int((time.time() - start_time) * 1000)

    # Get individual category scores (min of front/back)
    if has_back:
        centering = min(
            subgrade_results.get("centering_front", SubgradeResult(5, 0, "")).score,
            subgrade_results.get("centering_back", SubgradeResult(5, 0, "")).score,
        )
        corners = min(
            subgrade_results.get("corners_front", SubgradeResult(5, 0, "")).score,
            subgrade_results.get("corners_back", SubgradeResult(5, 0, "")).score,
        )
        edges = min(
            subgrade_results.get("edges_front", SubgradeResult(5, 0, "")).score,
            subgrade_results.get("edges_back", SubgradeResult(5, 0, "")).score,
        )
        surface = min(
            subgrade_results.get("surface_front", SubgradeResult(5, 0, "")).score,
            subgrade_results.get("surface_back", SubgradeResult(5, 0, "")).score,
        )
    else:
        centering = subgrade_results.get("centering_front", SubgradeResult(5, 0, "")).score
        corners = subgrade_results.get("corners_front", SubgradeResult(5, 0, "")).score
        edges = subgrade_results.get("edges_front", SubgradeResult(5, 0, "")).score
        surface = subgrade_results.get("surface_front", SubgradeResult(5, 0, "")).score

    return GradingResult(
        overall=overall,
        centering=centering,
        corners=corners,
        edges=edges,
        surface=surface,
        confidence=avg_confidence,
        notes=notes,
        limitations=limitations,
        subgrade_details=subgrade_results,
        front_overall=round_grade(front_avg),
        back_overall=round_grade(back_avg),
        grade_distribution=compute_grade_distribution(overall, avg_confidence),
        model=model,
        processing_time_ms=elapsed_ms,
    )


# ── Card Detection via LLM ────────────────────────────────────────────────────

DETECT_PROMPT = """Locate the trading card in this photo. Return the four corner positions as JSON with pixel coordinates.

If the card fills the entire image (no visible background), return {"fills_frame": true}.

Otherwise return the four corners of the card (not the bounding box — the actual card corners, even if tilted):
{"topLeft": {"x": <px>, "y": <px>}, "topRight": {"x": <px>, "y": <px>}, "bottomLeft": {"x": <px>, "y": <px>}, "bottomRight": {"x": <px>, "y": <px>}}

Respond ONLY with valid JSON, no markdown."""


def detect_card_with_ollama(
    image: Image.Image,
    model: str = OLLAMA_MODEL,
) -> dict[str, Any] | None:
    """
    Detect card corners using Ollama vision model.

    Returns:
        Dict with corners and tilt info, or None if detection fails
    """
    image_b64 = encode_image_to_base64(image)

    try:
        response = ollama.chat(
            model=model,
            messages=[
                {
                    "role": "user",
                    "content": DETECT_PROMPT,
                    "images": [image_b64],
                }
            ],
        )

        response_text = response.get("message", {}).get("content", "")
        parsed = parse_json_response(response_text)

        if not parsed:
            return None

        # Handle fills_frame case
        if parsed.get("fills_frame"):
            width, height = image.size
            return {
                "fills_frame": True,
                "corners": {
                    "topLeft": {"x": 0, "y": 0},
                    "topRight": {"x": width, "y": 0},
                    "bottomLeft": {"x": 0, "y": height},
                    "bottomRight": {"x": width, "y": height},
                },
                "tilt_deg": 0,
            }

        # Extract corners
        corners = parsed.get("corners")
        if not corners:
            return None

        # Calculate tilt angle
        tl = corners.get("topLeft", {})
        tr = corners.get("topRight", {})
        bl = corners.get("bottomLeft", {})
        br = corners.get("bottomRight", {})

        if not all([tl, tr, bl, br]):
            return None

        import math
        top_angle = math.atan2(tr["y"] - tl["y"], tr["x"] - tl["x"])
        bottom_angle = math.atan2(br["y"] - bl["y"], br["x"] - bl["x"])
        tilt_deg = ((top_angle + bottom_angle) / 2) * (180 / math.pi)

        # Filter out unreasonable tilt
        if abs(tilt_deg) > 30:
            tilt_deg = 0

        return {
            "fills_frame": False,
            "corners": corners,
            "tilt_deg": round(tilt_deg, 2),
        }

    except Exception as e:
        print(f"[ollama] Card detection error: {e}")
        return None


# ── Testing ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    # Test with a sample image
    import sys

    if len(sys.argv) < 2:
        print("Usage: python ollama_grader.py <image_path>")
        print("Example: python ollama_grader.py test_card.jpg")
        sys.exit(1)

    image_path = sys.argv[1]
    try:
        image = Image.open(image_path)
        print(f"Grading {image_path} with Ollama ({OLLAMA_MODEL})...")

        result = grade_card_with_ollama(image, model=OLLAMA_MODEL)

        if result:
            print(f"\n=== Grading Result ===")
            print(f"Overall Grade: {result.overall}")
            print(f"Centering: {result.centering}")
            print(f"Corners: {result.corners}")
            print(f"Edges: {result.edges}")
            print(f"Surface: {result.surface}")
            print(f"Confidence: {result.confidence:.2f}")
            print(f"Front Overall: {result.front_overall}")
            print(f"Back Overall: {result.back_overall}")
            print(f"Processing Time: {result.processing_time_ms}ms")
            print(f"Notes: {result.notes}")
            print(f"\nGrade Distribution: {result.grade_distribution}")
        else:
            print("Grading failed.")

    except Exception as e:
        print(f"Error: {e}")

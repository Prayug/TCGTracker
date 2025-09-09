"""
Card Scanner Backend
Identifies Pokémon cards from images using the pokemon-card-recognizer library.
Runs on port 5001 (macOS port 5000 is used by AirPlay).
"""

import base64
import os
import re
import uuid
from io import BytesIO

import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image, ImageEnhance, ImageFilter

try:
    from card_recognizer.api.card_recognizer import CardRecognizer, OperatingMode
except ImportError:
    try:
        from pokemon_card_recognizer.api.card_recognizer import CardRecognizer, OperatingMode
    except ImportError:
        print("ERROR: pokemon-card-recognizer not installed.")
        print("Install with:  pip install pokemon-card-recognizer")
        raise SystemExit(1)

app = Flask(__name__)
CORS(app, supports_credentials=True)

UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), "temp_uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Lazy-loaded recognizer
_recognizer: CardRecognizer | None = None
_recognizer_error: str | None = None
_reference_ready: bool | None = None


def _check_reference_db() -> dict:
    """Check if the reference database is built and return status."""
    global _reference_ready
    try:
        from pokemon_card_recognizer.reference.core.build import ReferenceBuild
        ref_path = ReferenceBuild.get_path()
        if not os.path.exists(ref_path):
            _reference_ready = False
            return {"ready": False, "error": "Reference directory not found", "path": ref_path}
        pkl_files = [f for f in os.listdir(ref_path) if f.endswith(".pkl")]
        _reference_ready = len(pkl_files) > 0
        if not _reference_ready:
            return {"ready": False, "error": "Reference database empty -- run build_reference.py", "path": ref_path}
        return {"ready": True, "set_files": len(pkl_files), "path": ref_path}
    except Exception as e:
        _reference_ready = False
        return {"ready": False, "error": str(e)}

# Regex for Pokémon card numbers:
# XY84, XY124, SM01, SWSH001, SV001, GG01, TG01, RC01, 123, 123/165 …
_CARD_NUMBER_RE = re.compile(
    r'\b(?:SWSH|SWSHN|SIT|PAF|OBF|MEW|PAR|PAL|SVI|CRZ|LOR|ASR|BRS|FST|EVS|CPA|SSH|CEC|HIF|DAA|VIV|RCL|SHF|TEU|FLI|UPR|CIN|GRI|BUS|SUM|STS|EVO|FCO|BKP|BKT|AOR|ROS|PRC|PHF|XY|BW|DP|TM|PL|AR|SF|LA|MD|GE|SW|MT|HP|CG|LM|UF|EM|DX|EX|OP|TRR|MA|RG|SS|RS|SBL|NEN|SK|AQ|LC|E2|NEO|BS|JU|FO|TR|GT|B2)[A-Z0-9]*\d+\b'
    r'|\b[A-Z]{1,4}\d{1,4}\b'
    r'|\b\d{1,4}/\d{1,4}\b'
    r'|\b\d{1,4}\b',
    re.IGNORECASE,
)


def get_recognizer() -> CardRecognizer:
    global _recognizer, _recognizer_error

    if _recognizer is not None:
        return _recognizer

    if _recognizer_error is not None:
        raise RuntimeError(_recognizer_error)

    try:
        print("Initialising CardRecognizer (this may take a moment on first run)…")
        _recognizer = CardRecognizer(
            mode=OperatingMode.SINGLE_IMAGE,
            set_name="master",
            # shared_words_rarity down-weights words that appear on many cards
            # (e.g. "energy", "attack", "damage") so unique card words dominate
            classification_method="shared_words_rarity",
        )
        print("CardRecognizer ready.")
        return _recognizer
    except Exception as exc:
        msg = str(exc)
        _recognizer_error = msg
        if "Reference build not found" in msg or "No such file" in msg:
            raise RuntimeError(
                "Card reference database not built. "
                "Run: python build_reference.py  (takes 30-60 min, requires Pokemon TCG API key). "
                "Then restart this server."
            )
        raise


def preprocess_image(img: Image.Image) -> Image.Image:
    """Normalise image for better OCR accuracy."""
    if img.mode != "RGB":
        img = img.convert("RGB")

    # Keep higher resolution — 1600px catches card name / attack name text
    # that gets lost at 1024px on full-art cards.
    max_side = 1600
    w, h = img.size
    if max(w, h) > max_side:
        scale = max_side / max(w, h)
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

    # Sharpen to help OCR on slightly blurry photos
    img = img.filter(ImageFilter.UnsharpMask(radius=1.5, percent=150, threshold=3))

    # Boost contrast so light-on-dark card text is more distinct
    img = ImageEnhance.Contrast(img).enhance(1.25)

    return img


def _crop_number_strip(img: Image.Image) -> Image.Image:
    """
    Return the bottom-right quarter of the card where the card number lives
    (e.g. 'XY124', '123/165').  Upscale for better OCR accuracy.
    """
    w, h = img.size
    # bottom 15 %, right 40 %
    crop = img.crop((int(w * 0.60), int(h * 0.85), w, h))
    # upscale 3× so tiny text is readable
    new_w, new_h = crop.width * 3, crop.height * 3
    crop = crop.resize((new_w, new_h), Image.LANCZOS)
    crop = ImageEnhance.Contrast(crop).enhance(2.0)
    crop = ImageEnhance.Sharpness(crop).enhance(2.5)
    return crop


def _extract_card_number(img: Image.Image, recognizer: CardRecognizer) -> str | None:
    """
    Crop the card-number strip and run a focused EasyOCR pass.
    Returns the first plausible card-number token found, or None.
    """
    strip = _crop_number_strip(img)
    tmp_path = os.path.join(UPLOAD_FOLDER, f"numstrip_{uuid.uuid4().hex}.jpg")
    strip.save(tmp_path, "JPEG", quality=95)
    try:
        reader = recognizer.ocr_pipeline.ocr_op.easy_ocr_reader
        results = reader.readtext(tmp_path, detail=1)
        all_text = " ".join(r[1] for r in results)
        print(f"  [number strip OCR] raw text: {repr(all_text)}")

        # Collect all candidate tokens and pick the most specific one
        candidates = []
        for token in all_text.upper().replace("/", " ").split():
            token = token.strip(".,;:()[]")
            # Must contain at least one digit
            if not any(c.isdigit() for c in token):
                continue
            # Skip very long garbage tokens
            if len(token) > 10:
                continue
            candidates.append(token)

        if not candidates:
            return None

        # Prefer tokens that start with letters (set prefix like XY, SM, …)
        prefixed = [c for c in candidates if c[0].isalpha()]
        return prefixed[0] if prefixed else candidates[0]
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def _lookup_by_number(number: str, recognizer: CardRecognizer) -> dict | None:
    """
    Search the full reference for a card whose .number matches (case-insensitive).
    Returns a card info dict or None.
    """
    ref = recognizer.classifier.reference
    number_upper = number.upper()
    for card in ref.cards:
        card_num = str(getattr(card, "number", "") or "").upper()
        if card_num == number_upper:
            result = {
                "name": _safe_str(card, "name"),
                "set": _safe_set_name(card),
                "number": _safe_str(card, "number", ""),
                "id": getattr(card, "id", None),
                "source": "card_number_direct",
            }
            image = _safe_card_image(card)
            if image:
                result["image"] = image
            return result
    return None


def save_temp_image(img: Image.Image) -> str:
    """Save a PIL Image to a unique temp path and return the path."""
    filename = f"scan_{uuid.uuid4().hex}.jpg"
    path = os.path.join(UPLOAD_FOLDER, filename)
    img.save(path, "JPEG", quality=92)
    return path


def _safe_set_name(card) -> str:
    """Extract set name regardless of whether card.set is a string or object."""
    s = getattr(card, "set", None)
    if s is None:
        return "Unknown"
    if isinstance(s, str):
        return s
    return getattr(s, "name", str(s))


def _safe_str(card, attr: str, fallback: str = "Unknown") -> str:
    val = getattr(card, attr, None)
    return str(val) if val is not None else fallback


def _safe_card_image(card) -> dict | None:
    """Extract image URLs from a card's .images attribute."""
    images = getattr(card, "images", None)
    if images is None:
        return None
    small = getattr(images, "small", None)
    large = getattr(images, "large", None)
    if not small and not large:
        return None
    return {"small": small, "large": large}


# ── Routes ────────────────────────────────────────────────────────────────────


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "message": "Card Scanner API is running"})


def _build_debug_info(recognizer: CardRecognizer, top_n: int = 10) -> dict:
    """
    Re-run the classifier with include_probs=True so we can inspect every
    candidate score, then return a structured debug dict AND print it to stdout.
    """
    ref = recognizer.classifier.reference
    ocr_input = recognizer.classifier.input  # cached from last exec() call

    # Re-run with full probabilities
    debug_result = recognizer.classifier.classify(
        ocr_results=ocr_input,
        include_probs=True,
    )

    ocr_words: list[str] = []
    if ocr_input:
        for word_list in ocr_input:
            ocr_words.extend(word_list)

    candidates: list[dict] = []
    if debug_result and len(debug_result) > 0:
        pred = debug_result[0]
        if pred.all_probs is not None:
            probs = pred.all_probs
            top_indices = np.argsort(probs)[::-1][:top_n]
            for idx in top_indices:
                score = float(probs[idx])
                if score <= 0:
                    continue
                try:
                    card = ref.lookup_by_index(int(idx))
                    candidates.append({
                        "rank": len(candidates) + 1,
                        "score": round(score, 6),
                        "name": _safe_str(card, "name"),
                        "set": _safe_set_name(card),
                        "number": _safe_str(card, "number", "?"),
                        "id": getattr(card, "id", None),
                    })
                except Exception:
                    candidates.append({
                        "rank": len(candidates) + 1,
                        "score": round(score, 6),
                        "card_index": int(idx),
                    })

    # ── Pretty-print to server stdout ─────────────────────────────────────────
    sep = "─" * 60
    print(f"\n{sep}")
    print("CARD SCAN DEBUG")
    print(sep)
    print(f"OCR words detected ({len(ocr_words)}):  {ocr_words}")
    print(f"\nTop {len(candidates)} candidates:")
    for c in candidates:
        winner_marker = " ◀ WINNER" if c["rank"] == 1 else ""
        print(
            f"  #{c['rank']:>2}  score={c['score']:.6f}  "
            f"{c.get('name','?'):30s}  "
            f"{c.get('set','?'):35s}  "
            f"#{c.get('number','?')}"
            f"{winner_marker}"
        )
    if len(candidates) >= 2:
        gap = candidates[0]["score"] - candidates[1]["score"]
        print(f"\n  Score gap (1st vs 2nd): {gap:.6f}")
        if gap < 0.01:
            print("  ⚠  Very small gap — cards share most of their text.")
            print("     Art / card number differences can't be resolved by OCR alone.")
    print(sep + "\n", flush=True)

    return {"ocr_words": ocr_words, "candidates": candidates}


@app.route("/api/scan-card", methods=["POST"])
def scan_card():
    image_path: str | None = None
    try:
        img: Image.Image | None = None

        # ── Accept multipart file ──────────────────────────────────────────────
        if "image" in request.files:
            file = request.files["image"]
            if not file.filename:
                return jsonify({"success": False, "error": "No file selected"}), 400
            img = Image.open(file.stream)

        # ── Accept JSON base64 ────────────────────────────────────────────────
        elif request.is_json and request.json and "image" in request.json:
            raw = request.json["image"]
            if "base64," in raw:
                raw = raw.split("base64,", 1)[1]
            img = Image.open(BytesIO(base64.b64decode(raw)))

        else:
            return jsonify({"success": False, "error": "No image provided"}), 400

        # ── Pre-process & save ────────────────────────────────────────────────
        img = preprocess_image(img)
        image_path = save_temp_image(img)

        # ── Run recogniser ────────────────────────────────────────────────────
        recognizer = get_recognizer()
        pred_result = recognizer.exec(image_path)

        if image_path and os.path.exists(image_path):
            os.remove(image_path)
            image_path = None

        # ── Card-number direct lookup (runs in parallel with word-match) ──────
        print("  [card number] Attempting focused number-strip OCR…")
        detected_number = _extract_card_number(img, recognizer)
        number_match: dict | None = None
        if detected_number:
            print(f"  [card number] Candidate token: {detected_number!r}")
            number_match = _lookup_by_number(detected_number, recognizer)
            if number_match:
                print(f"  [card number] Direct hit → {number_match['name']} "
                      f"({number_match['set']} #{number_match['number']})")
            else:
                print(f"  [card number] No direct match for {detected_number!r}")
        else:
            print("  [card number] No number token found in strip.")

        # ── Debug output (stdout + response payload) ──────────────────────────
        debug = _build_debug_info(recognizer)
        debug["detected_number"] = detected_number
        debug["number_match"] = number_match

        # ── Choose best result ─────────────────────────────────────────────────
        # If we got a direct card-number hit, prefer it over word-match.
        # The number printed on the card is the ground truth.
        if number_match:
            card_info = {**number_match, "confidence": 1.0}
        elif pred_result and len(pred_result) > 0:
            top = pred_result[0]
            detected = recognizer.classifier.reference.lookup_card_prediction(top)
            card_info = {
                "name": _safe_str(detected, "name"),
                "set": _safe_set_name(detected),
                "number": _safe_str(detected, "number", ""),
                "confidence": float(getattr(top, "conf", 0.0)),
                "id": getattr(detected, "id", None),
                "source": "word_match",
            }
            image = _safe_card_image(detected)
            if image:
                card_info["image"] = image
        else:
            print("\n[SCAN DEBUG] No prediction returned — no vocab words matched.\n", flush=True)
            return jsonify({"success": False, "message": "No card detected in image", "debug": debug})

        return jsonify({"success": True, "card": card_info, "debug": debug})

    except RuntimeError as exc:
        _cleanup(image_path)
        return jsonify({"success": False, "error": str(exc)}), 503

    except Exception as exc:
        _cleanup(image_path)
        return jsonify({"success": False, "error": str(exc)}), 500


@app.route("/api/available-sets", methods=["GET"])
def available_sets():
    try:
        # Try both package namespaces
        try:
            from card_recognizer.reference.core.build import ReferenceBuild
        except ImportError:
            from pokemon_card_recognizer.reference.core.build import ReferenceBuild

        sets = ReferenceBuild.supported_card_sets()
        return jsonify({"success": True, "sets": sets})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


def _cleanup(path: str | None) -> None:
    if path and os.path.exists(path):
        try:
            os.remove(path)
        except OSError:
            pass


@app.route("/api/reference-status", methods=["GET"])
def reference_status():
    """Check if the card reference database is built and ready."""
    status = _check_reference_db()
    return jsonify({"success": True, **status})


if __name__ == "__main__":
    import sys
    port = int(os.environ.get("PORT", 5001))
    debug = os.environ.get("FLASK_DEBUG", "false").lower() in ("1", "true", "yes")
    print(f"Card Scanner Backend  →  http://localhost:{port}", flush=True)
    print(f"Health check          →  http://localhost:{port}/health", flush=True)
    print(f"Reference status      →  http://localhost:{port}/api/reference-status", flush=True)
    print(f"Temp uploads          →  {os.path.abspath(UPLOAD_FOLDER)}", flush=True)
    print(f"Debug mode            →  {debug}", flush=True)

    ref_status = _check_reference_db()
    if ref_status["ready"]:
        print(f"Reference database    →  Ready ({ref_status['set_files']} set files)")
    else:
        print(f"Reference database    →  NOT READY: {ref_status['error']}")
        print(f"                       Run: python build_reference.py")

    print("\nPress Ctrl+C to stop.\n", flush=True)
    sys.stdout.flush()
    app.run(debug=debug, host="0.0.0.0", port=port, use_reloader=False)

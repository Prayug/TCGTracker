"""
Card Scanner Backend
Identifies Pokémon cards from images using the pokemon-card-recognizer library.
Runs on port 5001 (macOS port 5000 is used by AirPlay).

Primary grading path: specialist CV pipeline (extraction + geometric centering +
ONNX/heuristic corners/edges/surface). Ollama LLM grading is demoted / optional.
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

# Ollama grader kept optional (not used on primary /api/grade-card path)
try:
    from ollama_grader import grade_card_with_ollama, OLLAMA_MODEL
    OLLAMA_AVAILABLE = True
except ImportError:
    OLLAMA_AVAILABLE = False
    OLLAMA_MODEL = "not installed"

try:
    from preprocessing import preprocess_card, detect_card_hybrid
    PREPROCESSING_AVAILABLE = True
except ImportError:
    PREPROCESSING_AVAILABLE = False

try:
    from extraction import extract_card
    EXTRACTION_AVAILABLE = True
except ImportError:
    EXTRACTION_AVAILABLE = False

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
    """Normalise image for better card recognition + OCR accuracy."""
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


def preprocess_for_grading(img: Image.Image) -> Image.Image:
    """Lighter preprocessing for grading analysis — no sharpening, minimal contrast.
    Sharpening distorts edge/variance analysis, so we only resize and minimally enhance."""
    if img.mode != "RGB":
        img = img.convert("RGB")

    # Keep high resolution for sharp evidence crops (grading service may resize further)
    max_side = 2400
    w, h = img.size
    if max(w, h) > max_side:
        scale = max_side / max(w, h)
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

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
    """Health check endpoint with grading provider status."""
    provider = {}
    try:
        from model_inference import provider_info
        provider = provider_info()
    except Exception as e:
        provider = {"error": str(e)}

    health_status = {
        "status": "ok",
        "message": "Card Scanner API is running",
        "features": {
            "opencv_grading": True,
            "specialist_pipeline": True,
            "extraction": EXTRACTION_AVAILABLE,
            "ollama_grading": OLLAMA_AVAILABLE,
            "preprocessing": PREPROCESSING_AVAILABLE,
        },
        "provider": provider,
    }

    if OLLAMA_AVAILABLE:
        try:
            import ollama
            models = ollama.list()
            model_names = [m.model for m in models.models] if models.models else []
            health_status["ollama"] = {
                "available": True,
                "model": OLLAMA_MODEL,
                "installed_models": model_names,
                "note": "Demoted — not used by primary /api/grade-card path",
            }
        except Exception as e:
            health_status["ollama"] = {
                "available": False,
                "error": str(e),
            }

    return jsonify(health_status)


@app.route("/api/ollama-models", methods=["GET"])
def ollama_models():
    """List available Ollama models."""
    if not OLLAMA_AVAILABLE:
        return jsonify({
            "success": False,
            "error": "Ollama not available",
        }), 503

    try:
        import ollama
        models = ollama.list()
        model_list = []
        for m in models.models:
            model_list.append({
                "name": m.model,
                "size": m.size if hasattr(m, 'size') else 0,
                "modified": str(m.modified_at) if hasattr(m, 'modified_at') else "",
            })
        return jsonify({
            "success": True,
            "models": model_list,
            "current_model": OLLAMA_MODEL,
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e),
        }), 500


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


# In-memory grading history for the Python service (cardId → list of results).
# Persistent history lives in the Node/SQLite grading_results table.
_grading_history: dict[str, list[dict]] = {}


@app.route("/api/grade-card", methods=["POST"])
def grade_card():
    """TAG-style AI condition grading (centering/corners/edges/surface) — front + optional back."""
    image_path: str | None = None
    back_image_path: str | None = None
    try:
        from grading_service import grade_card_image

        def _decode_image_from_request(field_name: str) -> Image.Image | None:
            """Extract a PIL Image from file upload or base64 JSON for a given field name."""
            if field_name in request.files:
                file = request.files[field_name]
                if not file.filename:
                    return None
                return Image.open(file.stream)
            elif request.is_json and request.json and field_name in request.json:
                raw = request.json[field_name]
                if "base64," in raw:
                    raw = raw.split("base64,", 1)[1]
                return Image.open(BytesIO(base64.b64decode(raw)))
            return None

        def _encode_preview(img: Image.Image) -> str:
            """Encode a high-res JPEG data URL for sharp evidence viewing."""
            try:
                buf = BytesIO()
                save_img = img.copy()
                if max(save_img.size) > 2400:
                    ratio = 2400 / max(save_img.size)
                    save_img = save_img.resize(
                        (int(save_img.width * ratio), int(save_img.height * ratio)),
                        Image.LANCZOS,
                    )
                save_img.save(buf, format="JPEG", quality=95)
                return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
            except Exception:
                return ""

        # Decode front image (required)
        front_img = _decode_image_from_request("image")
        if front_img is None:
            return jsonify({"success": False, "error": "No front image provided"}), 400

        front_img = preprocess_for_grading(front_img)
        front_b64 = _encode_preview(front_img)

        # Decode back image (optional)
        back_img = _decode_image_from_request("backImage")
        back_b64 = ""
        if back_img is not None:
            back_img = preprocess_for_grading(back_img)
            back_b64 = _encode_preview(back_img)

        meta = {}
        if request.is_json and request.json:
            meta = {
                "cardId": request.json.get("cardId"),
                "cardName": request.json.get("cardName"),
                "game": request.json.get("game", "pokemon"),
                "rawPrice": request.json.get("rawPrice"),
            }
        elif request.form:
            meta = {
                "cardId": request.form.get("cardId"),
                "cardName": request.form.get("cardName"),
                "game": request.form.get("game", "pokemon"),
                "rawPrice": request.form.get("rawPrice"),
            }

        grading = grade_card_image(front_img, back_img)

        # Optional estimated graded value from raw price × grade multiplier
        estimated = None
        raw_price = meta.get("rawPrice")
        if raw_price is not None:
            try:
                price = float(raw_price)
                grade = float(grading["grade"])
                multipliers = {
                    10.0: 3.5, 9.5: 3.0, 9.0: 2.5, 8.5: 2.0, 8.0: 1.75,
                    7.5: 1.5, 7.0: 1.3, 6.5: 1.15, 6.0: 1.1,
                    5.5: 1.05, 5.0: 1.0, 4.5: 0.9, 4.0: 0.85,
                    3.5: 0.75, 3.0: 0.7, 2.5: 0.6, 2.0: 0.5,
                    1.5: 0.4, 1.0: 0.35,
                }
                mult = multipliers.get(grade, 1.0)
                estimated = round(price * mult, 2)
            except (TypeError, ValueError):
                estimated = None

        result = {
            **grading,
            "cardId": meta.get("cardId") or "",
            "cardName": meta.get("cardName") or "Unknown Card",
            "game": meta.get("game") or "pokemon",
            "imageUrl": front_b64,
            "backImageUrl": back_b64,
            "timestamp": __import__("datetime").datetime.utcnow().isoformat() + "Z",
            "estimatedGradedValue": estimated,
        }

        card_key = result["cardId"] or result["id"]
        _grading_history.setdefault(card_key, []).insert(0, result)
        _grading_history[card_key] = _grading_history[card_key][:50]

        _cleanup(image_path)
        _cleanup(back_image_path)
        return jsonify({"success": True, "grading": result})

    except ImportError as exc:
        _cleanup(image_path)
        _cleanup(back_image_path)
        return jsonify({
            "success": False,
            "error": f"Grading dependencies missing: {exc}. Install opencv-python-headless and numpy.",
        }), 503
    except ValueError as exc:
        _cleanup(image_path)
        _cleanup(back_image_path)
        msg = str(exc)
        code = "quality_failed"
        detail = msg
        if ":" in msg:
            code, detail = msg.split(":", 1)
        return jsonify({
            "success": False,
            "error": detail.strip(),
            "code": code.strip(),
            "retakeRecommended": True,
        }), 422
    except Exception as exc:
        _cleanup(image_path)
        _cleanup(back_image_path)
        return jsonify({"success": False, "error": str(exc)}), 500


# ── Legacy LLM grading (demoted — not used by Node primary path) ───────────────

@app.route("/api/grade-card-llm", methods=["POST"])
def grade_card_llm():
    """
    Enhanced AI grading using local Ollama LLM (Gemma 3 4B).

    Uses 8-subgrade analysis with perspective correction:
    - centering (front/back)
    - corners (front/back)
    - edges (front/back)
    - surface (front/back)

    Completely free - runs locally on your hardware.
    """
    if not OLLAMA_AVAILABLE:
        return jsonify({
            "success": False,
            "error": "Ollama grading not available. Install ollama package: pip install ollama",
        }), 503

    try:
        def _decode_image_from_request(field_name: str) -> Image.Image | None:
            """Extract a PIL Image from file upload or base64 JSON."""
            if field_name in request.files:
                file = request.files[field_name]
                if not file.filename:
                    return None
                return Image.open(file.stream)
            elif request.is_json and request.json and field_name in request.json:
                raw = request.json[field_name]
                if "base64," in raw:
                    raw = raw.split("base64,", 1)[1]
                return Image.open(BytesIO(base64.b64decode(raw)))
            return None

        def _encode_preview(img: Image.Image) -> str:
            """Encode a high-res JPEG data URL for sharp evidence viewing."""
            try:
                buf = BytesIO()
                save_img = img.copy()
                if max(save_img.size) > 2400:
                    ratio = 2400 / max(save_img.size)
                    save_img = save_img.resize(
                        (int(save_img.width * ratio), int(save_img.height * ratio)),
                        Image.LANCZOS,
                    )
                save_img.save(buf, format="JPEG", quality=95)
                return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
            except Exception:
                return ""

        # Decode front image (required)
        front_img = _decode_image_from_request("image")
        if front_img is None:
            return jsonify({"success": False, "error": "No front image provided"}), 400

        # Apply preprocessing if available
        if PREPROCESSING_AVAILABLE:
            try:
                preprocessed = preprocess_card(front_img)
                front_img = preprocessed.card_image
            except Exception as e:
                print(f"[app] Preprocessing failed, using original: {e}")

        # Preprocess for grading
        front_img = preprocess_for_grading(front_img)
        front_b64 = _encode_preview(front_img)

        # Decode back image (optional)
        back_img = _decode_image_from_request("backImage")
        back_b64 = ""
        if back_img is not None:
            if PREPROCESSING_AVAILABLE:
                try:
                    preprocessed_back = preprocess_card(back_img)
                    back_img = preprocessed_back.card_image
                except Exception as e:
                    print(f"[app] Back preprocessing failed, using original: {e}")

            back_img = preprocess_for_grading(back_img)
            back_b64 = _encode_preview(back_img)

        # Get metadata
        meta = {}
        if request.is_json and request.json:
            meta = {
                "cardId": request.json.get("cardId"),
                "cardName": request.json.get("cardName"),
                "game": request.json.get("game", "pokemon"),
                "rawPrice": request.json.get("rawPrice"),
                "model": request.json.get("model", OLLAMA_MODEL),
            }
        elif request.form:
            meta = {
                "cardId": request.form.get("cardId"),
                "cardName": request.form.get("cardName"),
                "game": request.form.get("game", "pokemon"),
                "rawPrice": request.form.get("rawPrice"),
                "model": request.form.get("model", OLLAMA_MODEL),
            }

        # Grade with Ollama LLM
        model = meta.get("model", OLLAMA_MODEL)
        grading_result = grade_card_with_ollama(front_img, back_img, model=model)

        if grading_result is None:
            return jsonify({
                "success": False,
                "error": "LLM grading failed. Check Ollama is running and model is installed.",
            }), 500

        # Convert to response format
        subgrade_details = {}
        for key, subgrade in grading_result.subgrade_details.items():
            subgrade_details[key] = {
                "score": subgrade.score,
                "confidence": subgrade.confidence,
                "detail": subgrade.detail,
                "lr": subgrade.lr,
                "tb": subgrade.tb,
            }

        # Optional estimated graded value
        estimated = None
        raw_price = meta.get("rawPrice")
        if raw_price is not None:
            try:
                price = float(raw_price)
                grade = float(grading_result.overall)
                multipliers = {
                    10.0: 3.5, 9.5: 3.0, 9.0: 2.5, 8.5: 2.0, 8.0: 1.75,
                    7.5: 1.5, 7.0: 1.3, 6.5: 1.15, 6.0: 1.1,
                    5.5: 1.05, 5.0: 1.0, 4.5: 0.9, 4.0: 0.85,
                    3.5: 0.75, 3.0: 0.7, 2.5: 0.6, 2.0: 0.5,
                    1.5: 0.4, 1.0: 0.35,
                }
                mult = multipliers.get(grade, 1.0)
                estimated = round(price * mult, 2)
            except (TypeError, ValueError):
                estimated = None

        result = {
            "id": str(uuid.uuid4()),
            "grade": grading_result.overall,
            "label": _get_grade_label(grading_result.overall),
            "centering": grading_result.centering,
            "corners": grading_result.corners,
            "edges": grading_result.edges,
            "surface": grading_result.surface,
            "confidence": grading_result.confidence,
            "frontOverall": grading_result.front_overall,
            "backOverall": grading_result.back_overall,
            "gradeDistribution": grading_result.grade_distribution,
            "notes": grading_result.notes,
            "limitations": grading_result.limitations,
            "subgradeDetails": subgrade_details,
            "provider": "ollama",
            "model": model,
            "processingTimeMs": grading_result.processing_time_ms,
            "cardId": meta.get("cardId") or "",
            "cardName": meta.get("cardName") or "Unknown Card",
            "game": meta.get("game") or "pokemon",
            "imageUrl": front_b64,
            "backImageUrl": back_b64,
            "timestamp": __import__("datetime").datetime.utcnow().isoformat() + "Z",
            "estimatedGradedValue": estimated,
        }

        # Store in history
        card_key = result["cardId"] or result["id"]
        _grading_history.setdefault(card_key, []).insert(0, result)
        _grading_history[card_key] = _grading_history[card_key][:50]

        return jsonify({"success": True, "grading": result})

    except Exception as exc:
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(exc)}), 500


def _get_grade_label(grade: float) -> str:
    """Map numeric grade to PSA label."""
    if grade >= 9.5:
        return "Gem Mint"
    elif grade >= 8.5:
        return "Mint"
    elif grade >= 7.5:
        return "NM-MT"
    elif grade >= 6.5:
        return "NM"
    elif grade >= 5.5:
        return "EX-MT"
    elif grade >= 4.5:
        return "EX"
    elif grade >= 3.5:
        return "VG-EX"
    elif grade >= 2.5:
        return "VG"
    elif grade >= 1.5:
        return "Good"
    else:
        return "Fair"


@app.route("/api/grading-history/<card_id>", methods=["GET"])
def grading_history(card_id: str):
    history = _grading_history.get(card_id, [])
    return jsonify({"success": True, "history": history, "count": len(history)})


if __name__ == "__main__":
    import sys
    port = int(os.environ.get("PORT", 5001))
    debug = os.environ.get("FLASK_DEBUG", "false").lower() in ("1", "true", "yes")
    print(f"Card Scanner Backend  →  http://localhost:{port}", flush=True)
    print(f"Health check          →  http://localhost:{port}/health", flush=True)
    print(f"Reference status      →  http://localhost:{port}/api/reference-status", flush=True)
    print(f"Grade card            →  http://localhost:{port}/api/grade-card", flush=True)
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

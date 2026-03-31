"""
Card Scanner Backend
Identifies Pokémon cards from images using the pokemon-card-recognizer library.
Runs on port 5001 (macOS port 5000 is used by AirPlay).
"""

import base64
import os
import uuid
from io import BytesIO

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
CORS(app)

UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), "temp_uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Lazy-loaded recognizer
_recognizer: CardRecognizer | None = None
_recognizer_error: str | None = None


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
        )
        print("CardRecognizer ready.")
        return _recognizer
    except Exception as exc:
        msg = str(exc)
        _recognizer_error = msg
        if "Reference build not found" in msg or "No such file" in msg:
            raise RuntimeError(
                "Card reference database not found. "
                "Run  python -m pokemon_card_recognizer.reference.core.build  "
                "to build it first, then restart the server."
            )
        raise


def preprocess_image(img: Image.Image) -> Image.Image:
    """Normalise image for better OCR accuracy."""
    # Convert to RGB (drop alpha channel / handle CMYK)
    if img.mode != "RGB":
        img = img.convert("RGB")

    # Resize so the longest side is ~1024px — big enough for OCR, small enough to be fast
    max_side = 1024
    w, h = img.size
    if max(w, h) > max_side:
        scale = max_side / max(w, h)
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

    # Mild sharpening to help OCR on slightly blurry photos
    img = img.filter(ImageFilter.UnsharpMask(radius=1, percent=120, threshold=3))

    # Slightly boost contrast
    img = ImageEnhance.Contrast(img).enhance(1.15)

    return img


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


# ── Routes ────────────────────────────────────────────────────────────────────


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "message": "Card Scanner API is running"})


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

        if not pred_result or len(pred_result) == 0:
            return jsonify({"success": False, "message": "No card detected in image"})

        top = pred_result[0]  # CardPrediction object

        # Confidence is stored as `conf`, not `confidence`
        confidence = float(getattr(top, "conf", 0.0))

        detected = recognizer.classifier.reference.lookup_card_prediction(top)

        return jsonify({
            "success": True,
            "card": {
                "name": _safe_str(detected, "name"),
                "set": _safe_set_name(detected),
                "number": _safe_str(detected, "number", ""),
                "confidence": confidence,
                "id": getattr(detected, "id", None),
            },
        })

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


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    print(f"Starting Card Scanner Backend on http://localhost:{port}")
    print(f"Temp uploads: {os.path.abspath(UPLOAD_FOLDER)}")
    app.run(debug=False, host="0.0.0.0", port=port)

"""
ONNX specialist inference for corners / edges / surface.

Loads models from card-scanner-backend/models/ when present.
Falls back to improved classical heuristics when ONNX weights are missing.
"""

from __future__ import annotations

import os
import threading
from pathlib import Path
from typing import Any

import cv2
import numpy as np

MODELS_DIR = Path(__file__).resolve().parent / "models"

_SESSIONS: dict[str, Any] = {}
_ORT_AVAILABLE: bool | None = None
_SESSION_LOCK = threading.Lock()


def _ort():
    global _ORT_AVAILABLE
    if _ORT_AVAILABLE is False:
        return None
    try:
        import onnxruntime as ort  # type: ignore
        _ORT_AVAILABLE = True
        return ort
    except Exception:
        _ORT_AVAILABLE = False
        return None


def models_available() -> dict[str, bool]:
    return {
        "corners": (MODELS_DIR / "corners.onnx").exists(),
        "edges": (MODELS_DIR / "edges.onnx").exists(),
        "surface": (MODELS_DIR / "surface.onnx").exists(),
        "segmentation": (MODELS_DIR / "segmentation.onnx").exists(),
    }


def _get_session(name: str):
    path = MODELS_DIR / f"{name}.onnx"
    if not path.exists():
        return None
    with _SESSION_LOCK:
        if name in _SESSIONS:
            return _SESSIONS[name]
        ort = _ort()
        if ort is None:
            return None
        sess = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
        _SESSIONS[name] = sess
    return sess


def _preprocess_crop(bgr: np.ndarray, size: int = 224) -> np.ndarray:
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    resized = cv2.resize(rgb, (size, size), interpolation=cv2.INTER_AREA)
    x = resized.astype(np.float32) / 255.0
    # ImageNet normalization
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    x = (x - mean) / std
    x = np.transpose(x, (2, 0, 1))[None, ...]  # NCHW
    return x


def _predict_score(session, bgr: np.ndarray) -> tuple[float, float]:
    """Return (score 1-10, confidence 0-1)."""
    x = _preprocess_crop(bgr)
    input_name = session.get_inputs()[0].name
    out = session.run(None, {input_name: x})[0]
    out = np.asarray(out).reshape(-1)

    if out.size == 1:
        # Regression head: raw score
        score = float(np.clip(out[0], 1.0, 10.0))
        conf = 0.75
    elif out.size == 20:
        # Half-point classes 1.0, 1.5, ... 10.0
        probs = _softmax(out.astype(np.float32))
        idx = int(np.argmax(probs))
        score = 1.0 + idx * 0.5
        conf = float(probs[idx])
    else:
        # Softmax over bands; map to 1-10
        probs = _softmax(out.astype(np.float32))
        idx = int(np.argmax(probs))
        score = 1.0 + (idx / max(len(probs) - 1, 1)) * 9.0
        conf = float(probs[idx])

    # Apply calibration curve if present
    score = _calibrate(score, session)
    return round(score * 2) / 2.0, float(np.clip(conf, 0.2, 0.98))


def _softmax(x: np.ndarray) -> np.ndarray:
    x = x - np.max(x)
    e = np.exp(x)
    return e / (np.sum(e) + 1e-8)


def _calibrate(score: float, session) -> float:
    """Optional isotonic/bin calibration stored beside the model."""
    # Look up calibration by model path stem
    try:
        model_path = Path(session._model_path) if hasattr(session, "_model_path") else None
    except Exception:
        model_path = None
    # Try per-model calibration first
    meta = getattr(session, "_tcg_axis", None)
    if meta:
        per_model_cal = MODELS_DIR / f"{meta}_calibration.json"
        if per_model_cal.exists():
            cal_path = per_model_cal
        else:
            cal_path = MODELS_DIR / "calibration.json"
    else:
        cal_path = MODELS_DIR / "calibration.json"
    if not cal_path.exists():
        return score
    try:
        import json
        data = json.loads(cal_path.read_text())
        # Simple piecewise linear from bins
        bins = data.get("bins") or data.get("global")
        if not bins:
            return score
        xs = [float(b["x"]) for b in bins]
        ys = [float(b["y"]) for b in bins]
        return float(np.interp(score, xs, ys))
    except Exception:
        return score


# ── Heuristic fallbacks (used when ONNX missing) ──────────────────────────────

def _whitening_ratio(edge_bgr: np.ndarray) -> float:
    lab = cv2.cvtColor(edge_bgr, cv2.COLOR_BGR2LAB)
    L, a, b = cv2.split(lab)
    # Near-white, low chroma
    white = (L > 185) & (np.abs(a.astype(np.int16) - 128) < 18) & (np.abs(b.astype(np.int16) - 128) < 18)
    return float(np.mean(white))


def _heuristic_corners(card_bgr: np.ndarray) -> tuple[float, float, list[str]]:
    h, w = card_bgr.shape[:2]
    cw, ch = max(24, int(w * 0.18)), max(24, int(h * 0.18))
    regions = {
        "top-left": card_bgr[0:ch, 0:cw],
        "top-right": card_bgr[0:ch, w - cw : w],
        "bottom-left": card_bgr[h - ch : h, 0:cw],
        "bottom-right": card_bgr[h - ch : h, w - cw : w],
    }
    defects: list[str] = []
    scores: list[float] = []
    for name, roi in regions.items():
        wr = _whitening_ratio(roi)
        # Also check edge softness via gradient magnitude near tip
        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
        gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
        tip = float(np.mean(np.hypot(gx, gy)[: max(4, ch // 5), : max(4, cw // 5)]))
        tip_norm = float(np.clip(tip / 40.0, 0, 1))

        local = 10.0
        if wr > 0.12:
            local -= min(5.0, wr * 18)
            defects.append(f"{name}: corner whitening")
        elif wr > 0.05:
            local -= wr * 10
        if tip_norm < 0.25:
            local -= 1.2
            if tip_norm < 0.15:
                defects.append(f"{name}: soft/rounded corner")
        scores.append(max(1.0, local))

    score = float(np.min(scores))
    conf = 0.55 if not (MODELS_DIR / "corners.onnx").exists() else 0.7
    return round(score * 2) / 2, conf, defects


def _heuristic_edges(card_bgr: np.ndarray) -> tuple[float, float, list[str]]:
    h, w = card_bgr.shape[:2]
    t = max(6, int(min(h, w) * 0.035))
    strips = {
        "top": card_bgr[0:t, int(w * 0.1) : int(w * 0.9)],
        "bottom": card_bgr[h - t : h, int(w * 0.1) : int(w * 0.9)],
        "left": card_bgr[int(h * 0.1) : int(h * 0.9), 0:t],
        "right": card_bgr[int(h * 0.1) : int(h * 0.9), w - t : w],
    }
    defects: list[str] = []
    scores: list[float] = []
    for name, strip in strips.items():
        wr = _whitening_ratio(strip)
        local = 10.0
        if wr > 0.18:
            local -= min(5.5, wr * 16)
            defects.append(f"{name} edge: whitening")
        elif wr > 0.08:
            local -= wr * 8
        scores.append(max(1.0, local))
    score = float(np.min(scores))
    return round(score * 2) / 2, 0.55, defects


def _heuristic_surface(card_bgr: np.ndarray) -> tuple[float, float, list[str]]:
    h, w = card_bgr.shape[:2]
    m = max(8, min(h, w) // 20)
    inner = card_bgr[m : h - m, m : w - m]
    gray = cv2.cvtColor(inner, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    # Scratch-like residuals (suppress large print structure)
    high = cv2.subtract(gray, blur)
    thr = float(np.percentile(np.abs(high.astype(np.float32)), 97))
    mask = (np.abs(high.astype(np.float32)) > max(thr, 12)).astype(np.uint8)
    ratio = float(np.mean(mask))
    # Clouding / haze via local std in LAB L
    lab = cv2.cvtColor(inner, cv2.COLOR_BGR2LAB)
    L = lab[:, :, 0].astype(np.float32)
    cloud = float(np.std(cv2.GaussianBlur(L, (31, 31), 0)))

    defects: list[str] = []
    score = 10.0
    if ratio > 0.04:
        score -= min(4.0, ratio * 40)
        defects.append("Surface scuffs / scratches detected")
    elif ratio > 0.02:
        score -= ratio * 25
    if cloud > 22:
        score -= min(2.0, (cloud - 22) / 10)
        defects.append("Possible surface clouding / print wear")

    return round(max(1.0, score) * 2) / 2, 0.55, defects


def predict_axis(axis: str, card_bgr: np.ndarray) -> dict[str, Any]:
    """
    Predict a PSA-style subgrade for corners | edges | surface.
    """
    sess = _get_session(axis)
    if sess is not None:
        try:
            setattr(sess, "_tcg_axis", axis)
            # For corners/edges average localized crops; surface uses full card
            if axis == "corners":
                h, w = card_bgr.shape[:2]
                cw, ch = max(32, int(w * 0.2)), max(32, int(h * 0.2))
                crops = [
                    card_bgr[0:ch, 0:cw],
                    card_bgr[0:ch, w - cw : w],
                    card_bgr[h - ch : h, 0:cw],
                    card_bgr[h - ch : h, w - cw : w],
                ]
                scores, confs = [], []
                for c in crops:
                    s, cf = _predict_score(sess, c)
                    scores.append(s)
                    confs.append(cf)
                return {
                    "score": float(min(scores)),
                    "confidence": float(np.mean(confs)),
                    "defects": [],
                    "source": "onnx",
                }
            if axis == "edges":
                h, w = card_bgr.shape[:2]
                t = max(12, int(min(h, w) * 0.08))
                crops = [
                    card_bgr[0:t, :],
                    card_bgr[h - t : h, :],
                    card_bgr[:, 0:t],
                    card_bgr[:, w - t : w],
                ]
                scores, confs = [], []
                for c in crops:
                    s, cf = _predict_score(sess, c)
                    scores.append(s)
                    confs.append(cf)
                return {
                    "score": float(min(scores)),
                    "confidence": float(np.mean(confs)),
                    "defects": [],
                    "source": "onnx",
                }
            s, cf = _predict_score(sess, card_bgr)
            return {"score": s, "confidence": cf, "defects": [], "source": "onnx"}
        except Exception as e:
            print(f"[model_inference] ONNX {axis} failed: {e}")

    if axis == "corners":
        score, conf, defects = _heuristic_corners(card_bgr)
    elif axis == "edges":
        score, conf, defects = _heuristic_edges(card_bgr)
    else:
        score, conf, defects = _heuristic_surface(card_bgr)

    return {
        "score": score,
        "confidence": conf,
        "defects": defects,
        "source": "heuristic",
    }


def provider_info() -> dict[str, Any]:
    avail = models_available()
    return {
        "onnxRuntime": _ort() is not None,
        "models": avail,
        "modelsDir": str(MODELS_DIR),
        "usingHeuristics": not all(avail[k] for k in ("corners", "edges", "surface")),
    }

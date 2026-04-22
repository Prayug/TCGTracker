"""
Geometric centering v2 — measure borders on a warped canonical card.

Assumes outer edges of the image ARE the card edges (post-warp).
Detects art-frame transition with Lab + gradient fusion.
Marks full-art / borderless cards as low_confidence instead of inventing ratios.
"""

from __future__ import annotations

from typing import Any

import cv2
import numpy as np


FRONT_CENTERING_BANDS: list[tuple[int, float]] = [
    (55, 10.0),
    (60, 9.0),
    (65, 8.0),
    (70, 7.0),
    (80, 6.0),
]

BACK_CENTERING_BANDS: list[tuple[int, float]] = [
    (75, 10.0),
    (90, 9.0),
]


def centering_ratio_to_subgrade(max_ratio_pct: int, is_front: bool = True) -> float:
    bands = FRONT_CENTERING_BANDS if is_front else BACK_CENTERING_BANDS
    for max_ok, grade in bands:
        if max_ratio_pct <= max_ok:
            return grade
    last_band = bands[-1]
    extra = (max_ratio_pct - last_band[0]) / 20.0
    return max(1.0, round(last_band[1] - extra, 1))


def _scanline_border_width(
    line_lab: np.ndarray,
    line_grad: np.ndarray,
    max_scan: int,
    color_thr: float,
) -> tuple[int, float]:
    """
    Return (width_px, confidence) for one inward scan from the outer edge.
    Confidence drops when the transition is soft or noisy.
    """
    n = min(max_scan, len(line_lab), len(line_grad))
    if n < 8:
        return 0, 0.0

    line = line_lab[:n].astype(np.float32)
    # Outer border color reference (skip first pixel in case of warp aliasing)
    ref = np.median(line[1:5], axis=0)
    dists = np.linalg.norm(line - ref, axis=1)
    grads = line_grad[:n].astype(np.float32)

    # Combined score peaks at art transition
    combined = dists / (color_thr + 1e-6) + 0.65 * (grads / (float(np.median(grads) + 8.0)))
    # Require sustained rise past border region
    start = 4
    best_i = 0
    best_score = 0.0
    for i in range(start, n - 2):
        local = float(np.mean(combined[i : i + 2]))
        if local > best_score and dists[i] > color_thr * 0.7:
            best_score = local
            best_i = i

    if best_i <= 0:
        # Fallback: first color hit
        for i in range(start, n - 1):
            if dists[i] > color_thr and float(np.mean(dists[i : i + 2])) > color_thr * 0.85:
                conf = float(np.clip(dists[i] / (color_thr * 2.5), 0.2, 1.0))
                return i, conf
        return max(2, n // 8), 0.25

    conf = float(np.clip(best_score / 3.0, 0.2, 1.0))
    # Soft transitions → lower confidence
    if float(np.std(dists[1:6])) > color_thr * 0.8:
        conf *= 0.55
    return int(best_i), conf


def detect_borders_v2(card_bgr: np.ndarray) -> dict[str, Any]:
    """
    Measure left/right/top/bottom border widths on a warped card image.
    """
    lab = cv2.cvtColor(card_bgr, cv2.COLOR_BGR2LAB)
    gray = cv2.cvtColor(card_bgr, cv2.COLOR_BGR2GRAY)
    grad = cv2.Sobel(gray, cv2.CV_32F, 1, 1, ksize=3)
    grad = np.abs(grad)

    h, w = lab.shape[:2]
    max_scan = max(16, int(min(w, h) * 0.14))
    max_scan = min(max_scan, min(w, h) // 2)
    step = max(2, min(h, w) // 100)

    def _side_noise(side: str) -> float:
        if side == "left":
            patch = lab[int(h * 0.25) : int(h * 0.75), 1:max(4, w // 40)]
        elif side == "right":
            patch = lab[int(h * 0.25) : int(h * 0.75), w - max(4, w // 40) : w - 1]
        elif side == "top":
            patch = lab[1:max(4, h // 40), int(w * 0.25) : int(w * 0.75)]
        else:
            patch = lab[h - max(4, h // 40) : h - 1, int(w * 0.25) : int(w * 0.75)]
        if patch.size < 12:
            return 18.0
        flat = patch.reshape(-1, 3).astype(np.float32)
        flat = flat[flat[:, 0] < 210]
        if flat.size < 12:
            return 20.0
        med = np.median(flat, axis=0)
        return float(np.median(np.linalg.norm(flat - med, axis=1)))

    def measure(side: str) -> tuple[int, float]:
        noise = _side_noise(side)
        thr = float(np.clip(max(11.0, noise * 1.3 + 6.0), 11.0, 28.0))
        widths: list[int] = []
        confs: list[float] = []

        if side in ("left", "right"):
            y0, y1 = int(h * 0.18), int(h * 0.82)
            for y in range(y0, y1, step):
                if side == "left":
                    line = lab[y, :max_scan]
                    gline = grad[y, :max_scan]
                else:
                    line = lab[y, w - 1 : w - max_scan - 1 : -1]
                    gline = grad[y, w - 1 : w - max_scan - 1 : -1]
                wi, cf = _scanline_border_width(line, gline, max_scan, thr)
                widths.append(wi)
                confs.append(cf)
        else:
            x0, x1 = int(w * 0.18), int(w * 0.82)
            for x in range(x0, x1, step):
                if side == "top":
                    line = lab[:max_scan, x]
                    gline = grad[:max_scan, x]
                else:
                    line = lab[h - 1 : h - max_scan - 1 : -1, x]
                    gline = grad[h - 1 : h - max_scan - 1 : -1, x]
                wi, cf = _scanline_border_width(line, gline, max_scan, thr)
                widths.append(wi)
                confs.append(cf)

        if not widths:
            return 0, 0.0
        arr = np.array(widths, dtype=np.float32)
        med = float(np.median(arr))
        mad = float(np.median(np.abs(arr - med))) + 1e-6
        keep = arr[np.abs(arr - med) <= max(4.0, 2.5 * mad)]
        width = int(round(float(np.median(keep if keep.size else arr))))
        conf = float(np.median(confs)) if confs else 0.3
        # High variance → borderless / full-art suspicion
        if float(np.std(arr)) > max(6.0, med * 0.55):
            conf *= 0.45
        lo = max(1, int(min(w, h) * 0.004))
        hi = max(lo + 1, int(min(w, h) * 0.16))
        return int(np.clip(width, lo, hi)), float(np.clip(conf, 0.05, 1.0))

    left, lc = measure("left")
    right, rc = measure("right")
    top, tc = measure("top")
    bottom, bc = measure("bottom")

    borders = {"left": left, "right": right, "top": top, "bottom": bottom}
    confidences = {"left": lc, "right": rc, "top": tc, "bottom": bc}

    # Soft symmetry repair for glare-poisoned thin frames
    for a, b in (("left", "right"), ("top", "bottom")):
        wa, wb = borders[a], borders[b]
        if min(wa, wb) <= 0:
            continue
        ratio = max(wa, wb) / float(min(wa, wb))
        if ratio > 3.2 and max(wa, wb) < int(min(w, h) * 0.06):
            bigger = a if wa > wb else b
            smaller = b if wa > wb else a
            borders[bigger] = int(round(borders[smaller] * 2.2))
            confidences[bigger] *= 0.6

    mean_conf = float(np.mean(list(confidences.values())))
    mean_w = float(np.mean([left, right, top, bottom]))
    thin = mean_w < min(w, h) * 0.012
    # Full-art / borderless heuristic
    is_borderless = thin or mean_conf < 0.40

    return {
        "borders": borders,
        "confidences": confidences,
        "meanConfidence": round(mean_conf, 3),
        "isBorderless": is_borderless,
        "meanWidth": round(mean_w, 1),
    }


def analyze_centering_v2(
    card_bgr: np.ndarray,
    is_front: bool = True,
) -> dict[str, Any]:
    """
    Return centering analysis dict compatible with CategoryResult fields.
    """
    h, w = card_bgr.shape[:2]
    info = detect_borders_v2(card_bgr)
    borders = info["borders"]
    left = float(borders["left"])
    right = float(borders["right"])
    top = float(borders["top"])
    bottom = float(borders["bottom"])

    lr_pct = (left / (left + right + 1e-6)) * 100
    tb_pct = (top / (top + bottom + 1e-6)) * 100
    lr_max = max(lr_pct, 100 - lr_pct)
    tb_max = max(tb_pct, 100 - tb_pct)
    worst_max = max(lr_max, tb_max)

    score = centering_ratio_to_subgrade(int(round(worst_max)), is_front=is_front)
    confidence = float(info["meanConfidence"])
    defects: list[str] = []
    low_confidence = False

    if info["isBorderless"]:
        low_confidence = True
        confidence = min(confidence, 0.35)
        defects.append("Full-art / thin border — centering estimate is low confidence")
        # Don't invent gem-mint centering on borderless
        score = min(score, 8.0)

    if confidence < 0.4:
        low_confidence = True
        defects.append("Border transition uncertain — retake on solid background for better centering")

    lr_left = int(round(lr_pct))
    lr_right = 100 - lr_left
    tb_top = int(round(tb_pct))
    tb_bottom = 100 - tb_top
    details = (
        f"L/R {lr_left}/{lr_right}, T/B {tb_top}/{tb_bottom} "
        f"(worst axis {int(round(worst_max))}/"
        f"{100 - int(round(worst_max))})"
    )
    if low_confidence:
        details += " [low confidence]"

    return {
        "score": float(score),
        "details": details,
        "defects": defects,
        "deviations": {
            "leftRight": round(lr_max, 1),
            "topBottom": round(tb_max, 1),
            "borders": borders,
            "confidence": round(confidence, 3),
            "lowConfidence": low_confidence,
            "isBorderless": bool(info["isBorderless"]),
        },
        "confidence": confidence,
        "lowConfidence": low_confidence,
    }

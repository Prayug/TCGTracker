"""
Physical measurement helpers for machine-style card grading.

A Pokémon / standard TCG card is 63 × 88 mm. After perspective warp to the
canonical 1002 × 1400 canvas, pixels map to millimeters. Internal scoring
uses a 0–1000 TCG Condition Score; professional grades are a translation of
that measurement, not the other way around.
"""

from __future__ import annotations

from typing import Any

import cv2
import numpy as np

# ISO 7810 ID-1 / Pokémon TCG
CARD_W_MM = 63.0
CARD_H_MM = 88.0
# Typical printed corner radius on modern Pokémon cards (approx.)
EXPECTED_CORNER_RADIUS_MM = 1.6


def px_scale(card_bgr: np.ndarray) -> tuple[float, float]:
    """Return (mm_per_px_x, mm_per_px_y) for a canonical-warped card."""
    h, w = card_bgr.shape[:2]
    return CARD_W_MM / max(1, w), CARD_H_MM / max(1, h)


def px_to_mm(px: float, card_bgr: np.ndarray, axis: str = "x") -> float:
    sx, sy = px_scale(card_bgr)
    return float(px) * (sx if axis == "x" else sy)


def area_px_to_mm2(area_px: float, card_bgr: np.ndarray) -> float:
    sx, sy = px_scale(card_bgr)
    return float(area_px) * sx * sy


def to_tcg_points(score_1_10: float | None) -> int | None:
    """Map a 1–10 specialist score onto the 0–1000 internal scale."""
    if score_1_10 is None:
        return None
    return int(np.clip(round(float(score_1_10) * 100.0), 1, 1000))


def tcg_overall(
    category_points: dict[str, int | None],
    *,
    ceiling: int | None = None,
) -> int:
    """
    Bottleneck 0–1000 score. Missing/withheld categories do not pull the
    number down — they widen uncertainty at a higher layer.
    """
    usable = [v for v in category_points.values() if v is not None]
    if not usable:
        return 500
    avg = sum(usable) / len(usable)
    worst = min(usable)
    overall = int(round(avg * 0.25 + worst * 0.75))
    if ceiling is not None:
        overall = min(overall, ceiling)
    return int(np.clip(overall, 1, 1000))


def _whitening_mask(edge_strip_bgr: np.ndarray) -> tuple[float, np.ndarray]:
    """Near-white, low-chroma pixels — pulp exposure / edge whitening."""
    if edge_strip_bgr.size == 0:
        return 0.0, np.zeros((1, 1), dtype=np.uint8)
    lab = cv2.cvtColor(edge_strip_bgr, cv2.COLOR_BGR2LAB)
    L = lab[:, :, 0].astype(np.float32)
    a = lab[:, :, 1].astype(np.float32)
    b = lab[:, :, 2].astype(np.float32)
    chroma = np.hypot(a - 128.0, b - 128.0)
    mask = ((L > 185) & (chroma < 22)).astype(np.uint8) * 255
    return float(np.mean(mask > 0)), mask


def edge_profiles(card_bgr: np.ndarray, bins: int = 100) -> dict[str, Any]:
    """
    Represent each edge as a 1-D whitening/chip signal along its length.

    Returns coverage, max run length (mm), peak severity, and a compact
    sparkline (0–1 per bin) for UI / later models.
    """
    h, w = card_bgr.shape[:2]
    sx, sy = px_scale(card_bgr)
    strip = max(8, int(min(h, w) * 0.045))
    sides = {
        "left": card_bgr[:, :strip],
        "right": card_bgr[:, w - strip :],
        "top": card_bgr[:strip, :],
        "bottom": card_bgr[h - strip :, :],
    }
    out: dict[str, Any] = {}
    for name, roi in sides.items():
        _frac, mask = _whitening_mask(roi)
        if name in ("left", "right"):
            # mean across strip width → 1D along height
            signal = mask.mean(axis=1) / 255.0
            mm_per = sy
        else:
            signal = mask.mean(axis=0) / 255.0
            mm_per = sx
        # resample to `bins`
        x = np.linspace(0, 1, num=max(2, len(signal)))
        xp = np.linspace(0, 1, num=bins)
        sampled = np.interp(xp, x, signal.astype(np.float32))
        binary = sampled > 0.18
        coverage = float(np.mean(binary))
        # longest consecutive run
        run = 0
        best = 0
        for v in binary:
            if v:
                run += 1
                best = max(best, run)
            else:
                run = 0
        max_len_mm = best * (len(signal) / bins) * mm_per
        peak = float(np.max(sampled)) if sampled.size else 0.0
        mean_sev = float(np.mean(sampled[binary])) if np.any(binary) else 0.0
        out[name] = {
            "coverage": round(coverage, 4),
            "maxDefectLengthMm": round(float(max_len_mm), 2),
            "meanSeverity": round(mean_sev, 3),
            "peakSeverity": round(peak, 3),
            "sparkline": [round(float(v), 3) for v in sampled[::5]],  # 20 pts
        }
    affected = [s for s in out.values() if isinstance(s, dict) and "coverage" in s and s["coverage"] > 0.04]
    sides_only = {k: v for k, v in out.items() if k in ("left", "right", "top", "bottom")}
    out["summary"] = {
        "affectedEdges": len(affected),
        "worstCoverage": round(max((s["coverage"] for s in sides_only.values()), default=0.0), 4),
        "worstLengthMm": round(max((s["maxDefectLengthMm"] for s in sides_only.values()), default=0.0), 2),
    }
    return out


def corner_geometry(card_bgr: np.ndarray) -> list[dict[str, Any]]:
    """Measure each corner: whitening area (mm²) and contour recession (mm)."""
    h, w = card_bgr.shape[:2]
    cw, ch = max(24, int(w * 0.14)), max(24, int(h * 0.14))
    positions = [
        ("top-left", 0, 0, 1, 1),
        ("top-right", w - cw, 0, -1, 1),
        ("bottom-left", 0, h - ch, 1, -1),
        ("bottom-right", w - cw, h - ch, -1, -1),
    ]
    results: list[dict[str, Any]] = []
    for name, x, y, sx_dir, sy_dir in positions:
        roi = card_bgr[y : y + ch, x : x + cw]
        if roi.size == 0:
            continue
        frac, mask = _whitening_mask(roi)
        area_mm2 = area_px_to_mm2(float(np.sum(mask > 0)), card_bgr)
        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(gray, 40, 120)
        # Distance from the expected tip (outer corner of the crop)
        tip_x = 0 if sx_dir > 0 else cw - 1
        tip_y = 0 if sy_dir > 0 else ch - 1
        ys, xs = np.where(edges > 0)
        recession_mm = 0.0
        if xs.size:
            dist = np.hypot(xs.astype(np.float32) - tip_x, ys.astype(np.float32) - tip_y)
            # nearest edge pixel to the geometric tip
            recession_px = float(np.percentile(dist, 8))
            recession_mm = px_to_mm(recession_px, card_bgr, "x")
        integrity = float(np.clip(1.0 - frac * 2.2 - min(0.4, recession_mm / 1.2), 0.0, 1.0))
        results.append({
            "name": name,
            "whiteningAreaMm2": round(area_mm2, 2),
            "maxRecessionMm": round(recession_mm, 2),
            "contourIntegrity": round(integrity, 3),
            "fiberExposure": "yes" if frac > 0.18 else "none",
        })
    return results


def centering_mm(borders_px: dict[str, int], card_bgr: np.ndarray) -> dict[str, Any]:
    """Convert pixel border widths to millimeters and L/R T/B ratios."""
    h, w = card_bgr.shape[:2]
    left = px_to_mm(borders_px.get("left", 0), card_bgr, "x")
    right = px_to_mm(borders_px.get("right", 0), card_bgr, "x")
    top = px_to_mm(borders_px.get("top", 0), card_bgr, "y")
    bottom = px_to_mm(borders_px.get("bottom", 0), card_bgr, "y")
    lr_sum = left + right + 1e-6
    tb_sum = top + bottom + 1e-6
    lr_left = left / lr_sum * 100
    tb_top = top / tb_sum * 100
    return {
        "leftMm": round(left, 2),
        "rightMm": round(right, 2),
        "topMm": round(top, 2),
        "bottomMm": round(bottom, 2),
        "leftRight": f"{lr_left:.1f} / {100 - lr_left:.1f}",
        "topBottom": f"{tb_top:.1f} / {100 - tb_top:.1f}",
        "cardSizeMm": [CARD_W_MM, CARD_H_MM],
        "canonicalPx": [w, h],
    }


def defect_measurement(
    *,
    kind: str,
    side: str,
    location: str,
    coverage: float,
    severity: float,
    confidence: float,
    length_mm: float | None = None,
    area_mm2: float | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    d: dict[str, Any] = {
        "type": kind,
        "side": side,
        "location": location,
        "coverage": round(coverage, 4),
        "severity": round(severity, 3),
        "confidence": round(confidence, 3),
    }
    if length_mm is not None:
        d["lengthMm"] = round(length_mm, 2)
    if area_mm2 is not None:
        d["areaMm2"] = round(area_mm2, 2)
    if extra:
        d.update(extra)
    return d

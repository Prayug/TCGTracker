"""
Multi-frame surface inspection.

A scratch is anchored to the card across lighting angles. Glare moves.
After warping each capture to the canonical rectangle, we build:

  - specularity mask per frame
  - persistent defect map (high in many frames)
  - glare candidate map (high variance / only one frame)

Surface findings that only exist inside glare, or that fail to persist
across frames, are not scored.
"""

from __future__ import annotations

from typing import Any

import cv2
import numpy as np

from quality_gate import glare_ratio


def specularity_mask(bgr: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    s, v = hsv[:, :, 1], hsv[:, :, 2]
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)
    L = lab[:, :, 0]
    mask = (((v >= 238) & (s <= 50)) | (L >= 246)).astype(np.uint8) * 255
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    return cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k)


def _scratch_residual(bgr: np.ndarray) -> np.ndarray:
    """High-frequency residual, 0–1, inner card only."""
    h, w = bgr.shape[:2]
    m = max(8, min(h, w) // 18)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    inner = gray[m : h - m, m : w - m]
    blur = cv2.GaussianBlur(inner, (5, 5), 0)
    high = np.abs(inner.astype(np.float32) - blur.astype(np.float32))
    p97 = float(np.percentile(high, 97)) if high.size else 12.0
    residual = np.clip(high / max(p97, 12.0), 0, 1)
    full = np.zeros((h, w), dtype=np.float32)
    full[m : h - m, m : w - m] = residual
    return full


def register_to_reference(src: np.ndarray, ref: np.ndarray) -> np.ndarray:
    """ECC warp src onto ref. Falls back to src if alignment fails."""
    if src.shape[:2] != ref.shape[:2]:
        src = cv2.resize(src, (ref.shape[1], ref.shape[0]), interpolation=cv2.INTER_LINEAR)
    try:
        src_g = cv2.cvtColor(src, cv2.COLOR_BGR2GRAY)
        ref_g = cv2.cvtColor(ref, cv2.COLOR_BGR2GRAY)
        warp = np.eye(2, 3, dtype=np.float32)
        criteria = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 40, 1e-4)
        _cc, warp = cv2.findTransformECC(
            ref_g, src_g, warp, cv2.MOTION_AFFINE, criteria, None, 1
        )
        aligned = cv2.warpAffine(
            src, warp, (ref.shape[1], ref.shape[0]), flags=cv2.INTER_LINEAR + cv2.WARP_INVERSE_MAP
        )
        return aligned
    except Exception:
        return src


def inspect_frames(
    primary: np.ndarray,
    extras: list[np.ndarray],
) -> dict[str, Any]:
    """
    Fuse extra illumination/angle frames against the primary canonical card.
    """
    frames = [primary] + [register_to_reference(f, primary) for f in extras if f is not None and f.size]
    n = len(frames)
    glare_primary = specularity_mask(primary)
    glare_ratio_primary = glare_ratio(primary)

    residuals = [_scratch_residual(f) for f in frames]
    stack = np.stack(residuals, axis=0)
    persist = np.mean(stack, axis=0)
    vary = np.var(stack, axis=0)
    # Persistent scratches: high in most frames, low variance (not a moving highlight)
    persistent = (persist > 0.35) & (vary < 0.08)
    glare_only = (vary > 0.12) | (glare_primary > 0)

    persist_frac = float(np.mean(persistent))
    glare_frac = float(np.mean(glare_primary > 0))
    confirmed = persist_frac >= 0.004 and n >= 2

    return {
        "frameCount": n,
        "glareRatio": round(glare_ratio_primary, 4),
        "glareCoverage": round(glare_frac, 4),
        "persistentDefectCoverage": round(persist_frac, 4),
        "surfaceConfirmed": confirmed,
        "unconfirmedLikelyGlare": bool(n >= 2 and persist_frac < 0.003 and glare_frac > 0.08),
        "message": (
            f"Surface inspected across {n} illumination/angle frames."
            if n >= 2
            else "Single-frame surface — scratches that only appear in glare are not confirmed."
        ),
    }


def should_keep_surface_detection(
    fusion: dict[str, Any],
    detection_kind: str,
) -> bool:
    """Drop scratch/print findings that failed multi-frame persistence."""
    if fusion.get("frameCount", 1) < 2:
        return True
    if detection_kind in ("scratch", "other") and fusion.get("unconfirmedLikelyGlare"):
        return False
    if detection_kind in ("scratch",) and not fusion.get("surfaceConfirmed") and fusion.get("glareCoverage", 0) > 0.1:
        return False
    return True

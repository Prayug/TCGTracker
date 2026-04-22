"""
Capture quality gate for card grading.

Rejects blurry, dark, or low-contrast photos before expensive analysis.
Returns actionable error codes the UI can show as retake guidance.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import cv2
import numpy as np
from PIL import Image


@dataclass
class QualityResult:
    ok: bool
    code: str | None = None
    message: str | None = None
    metrics: dict[str, float] | None = None

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {"ok": self.ok}
        if self.code:
            d["code"] = self.code
        if self.message:
            d["message"] = self.message
        if self.metrics:
            d["metrics"] = self.metrics
        return d


def _pil_to_bgr(img: Image.Image) -> np.ndarray:
    arr = np.array(img.convert("RGB"))
    return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)


def assess_image_quality(img: Image.Image) -> QualityResult:
    """
    Fast quality checks on a raw capture.

    Codes:
      too_small, too_blurry, too_dark, too_bright, low_contrast
    """
    bgr = _pil_to_bgr(img)
    h, w = bgr.shape[:2]
    metrics: dict[str, float] = {
        "width": float(w),
        "height": float(h),
    }

    if min(h, w) < 280:
        return QualityResult(
            ok=False,
            code="too_small",
            message="Image is too small. Use at least ~400px on the short side.",
            metrics=metrics,
        )

    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    # Downscale for speed on large photos
    scale = 640 / max(h, w)
    if scale < 1.0:
        gray_s = cv2.resize(gray, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    else:
        gray_s = gray

    lap_var = float(cv2.Laplacian(gray_s, cv2.CV_64F).var())
    # Edge density helps flat scans / studio shots that have low texture but clear borders
    edges = cv2.Canny(gray_s, 60, 150)
    edge_density = float(np.mean(edges > 0))
    mean_luma = float(np.mean(gray_s))
    contrast = float(np.std(gray_s))
    # Combined sharpness: texture OR structural edges
    sharpness_score = max(lap_var, edge_density * 800.0)
    metrics["sharpness"] = round(lap_var, 2)
    metrics["edgeDensity"] = round(edge_density, 4)
    metrics["sharpnessScore"] = round(sharpness_score, 2)
    metrics["brightness"] = round(mean_luma, 2)
    metrics["contrast"] = round(contrast, 2)

    # Thresholds tuned for phone photos of cards
    if sharpness_score < 28.0 and lap_var < 18.0:
        return QualityResult(
            ok=False,
            code="too_blurry",
            message="Photo looks blurry. Hold steady, tap to focus, and retake.",
            metrics=metrics,
        )
    if mean_luma < 35.0:
        return QualityResult(
            ok=False,
            code="too_dark",
            message="Photo is too dark. Use even lighting and avoid shadows.",
            metrics=metrics,
        )
    if mean_luma > 245.0:
        return QualityResult(
            ok=False,
            code="too_bright",
            message="Photo is overexposed. Reduce glare or bright reflections.",
            metrics=metrics,
        )
    if contrast < 14.0:
        return QualityResult(
            ok=False,
            code="low_contrast",
            message="Low contrast — place the card on a contrasting solid background.",
            metrics=metrics,
        )

    return QualityResult(ok=True, metrics=metrics)


def quality_confidence_penalty(metrics: dict[str, float] | None) -> float:
    """Return a 0–1 multiplier for overall confidence from quality metrics."""
    if not metrics:
        return 0.85
    sharp = float(metrics.get("sharpness", 80))
    bright = float(metrics.get("brightness", 128))
    contrast = float(metrics.get("contrast", 40))

    sharp_score = min(1.0, sharp / 120.0)
    bright_score = 1.0 - min(1.0, abs(bright - 140) / 140.0)
    contrast_score = min(1.0, contrast / 50.0)
    return float(np.clip(0.35 * sharp_score + 0.35 * bright_score + 0.30 * contrast_score, 0.35, 1.0))

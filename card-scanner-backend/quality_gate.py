"""
Capture quality gate for card grading.

Hard-fails photos that cannot be graded at all (blur, darkness, tiny files).
Separately refuses *surface* scoring when glare, sleeve plastic, or lighting
would make scratches/whitening indistinguishable from capture artifacts.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import cv2
import numpy as np
from PIL import Image

# Surface is refused when specular highlights cover this fraction of the card.
GLARE_REFUSE = 0.12
GLARE_WARN = 0.06
GLARE_EXTREME = 0.22


@dataclass
class QualityCheck:
    id: str
    status: str  # pass | warn | fail
    message: str
    value: float | None = None

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "id": self.id,
            "status": self.status,
            "message": self.message,
        }
        if self.value is not None:
            d["value"] = round(float(self.value), 4)
        return d


@dataclass
class QualityResult:
    ok: bool
    code: str | None = None
    message: str | None = None
    metrics: dict[str, float] | None = None
    checks: list[QualityCheck] = field(default_factory=list)
    surface_ok: bool = True
    surface_message: str | None = None
    glare_ratio: float = 0.0
    finish_hint: str = "unknown"

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "ok": self.ok,
            "surfaceOk": self.surface_ok,
            "glareRatio": round(self.glare_ratio, 4),
            "finishHint": self.finish_hint,
        }
        if self.code:
            d["code"] = self.code
        if self.message:
            d["message"] = self.message
        if self.surface_message:
            d["surfaceMessage"] = self.surface_message
        if self.metrics:
            d["metrics"] = self.metrics
        if self.checks:
            d["checks"] = [c.to_dict() for c in self.checks]
        return d


def _pil_to_bgr(img: Image.Image) -> np.ndarray:
    arr = np.array(img.convert("RGB"))
    return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)


def glare_ratio(bgr: np.ndarray) -> float:
    """Fraction of pixels that look like specular glare / blown highlights."""
    if bgr.size == 0:
        return 0.0
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    h, s, v = cv2.split(hsv)
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)
    L = lab[:, :, 0]
    specular = ((v >= 242) & (s <= 45)) | (L >= 248)
    # Ignore a 2px outer rim (often the table or crop edge)
    hgt, wdt = specular.shape
    m = max(2, min(hgt, wdt) // 80)
    inner = specular[m : hgt - m, m : wdt - m]
    if inner.size == 0:
        return float(np.mean(specular))
    return float(np.mean(inner))


def _block_luma_std(gray: np.ndarray, grid: int = 4) -> float:
    """Low-frequency lighting variation, not artwork contrast."""
    h, w = gray.shape
    k = max(21, (min(h, w) // 8) | 1)
    smooth = cv2.GaussianBlur(gray, (k, k), 0)
    bh, bw = max(1, h // grid), max(1, w // grid)
    means: list[float] = []
    for gy in range(grid):
        for gx in range(grid):
            block = smooth[gy * bh : (gy + 1) * bh, gx * bw : (gx + 1) * bw]
            if block.size:
                means.append(float(np.mean(block)))
    if len(means) < 4:
        return 0.0
    return float(np.std(np.array(means, dtype=np.float32)))


def _sleeve_score(bgr: np.ndarray) -> float:
    """
    Heuristic 0–1 for sleeve / toploader plastic.

    Plastic typically adds a second specular rim and a uniform sheen that
    is stronger near the perimeter than on a raw card.
    """
    h, w = bgr.shape[:2]
    t = max(6, int(min(h, w) * 0.06))
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    v = hsv[:, :, 2]
    s = hsv[:, :, 1]
    rim = np.zeros((h, w), dtype=bool)
    rim[:t, :] = True
    rim[h - t :, :] = True
    rim[:, :t] = True
    rim[:, w - t :] = True
    inner = ~rim
    rim_spec = float(np.mean((v[rim] >= 230) & (s[rim] <= 50)))
    inner_spec = float(np.mean((v[inner] >= 230) & (s[inner] <= 50))) if np.any(inner) else 0.0
    # Double-edge: two gradient peaks in a perimeter profile
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    left = gray[:, : min(w, t * 3)]
    gx = np.abs(cv2.Sobel(left, cv2.CV_32F, 1, 0, ksize=3)).mean(axis=0)
    peaks = 0
    if gx.size > 8:
        d = np.diff(gx)
        for i in range(1, len(d) - 1):
            if d[i - 1] > 0 and d[i] < 0 and gx[i] > float(np.mean(gx)) * 1.6:
                peaks += 1
    score = rim_spec * 1.4 + max(0.0, rim_spec - inner_spec) * 1.2 + min(0.35, peaks * 0.12)
    return float(np.clip(score, 0.0, 1.0))


def classify_finish(bgr: np.ndarray) -> str:
    """Coarse finish: non-holo | reverse-holo | standard-holo | textured."""
    h, w = bgr.shape[:2]
    m = max(8, min(h, w) // 18)
    inner = bgr[m : h - m, m : w - m]
    if inner.size < 100:
        inner = bgr
    lab = cv2.cvtColor(inner, cv2.COLOR_BGR2LAB)
    L = lab[:, :, 0].astype(np.float32)
    l_std = float(np.std(L))
    blur = cv2.GaussianBlur(cv2.cvtColor(inner, cv2.COLOR_BGR2GRAY), (5, 5), 0)
    gray = cv2.cvtColor(inner, cv2.COLOR_BGR2GRAY)
    local_var = float(np.mean((gray.astype(np.float32) - blur.astype(np.float32)) ** 2))
    if l_std > 58 and local_var > 220:
        return "textured"
    if l_std > 45 and local_var > 150:
        return "standard-holo"
    if l_std > 36 and local_var > 90:
        return "reverse-holo"
    return "non-holo"


def assess_image_quality(img: Image.Image) -> QualityResult:
    """
    Fast quality checks on a raw capture.

    Hard-fail codes: too_small, too_blurry, too_dark, too_bright, low_contrast
    Glare does not hard-fail the whole grade — that is handled after warp.
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
            surface_ok=False,
            surface_message="Resolution is too low to score surface.",
        )

    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    scale = 640 / max(h, w)
    if scale < 1.0:
        gray_s = cv2.resize(gray, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
        bgr_s = cv2.resize(bgr, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    else:
        gray_s = gray
        bgr_s = bgr

    lap_var = float(cv2.Laplacian(gray_s, cv2.CV_64F).var())
    edges = cv2.Canny(gray_s, 60, 150)
    edge_density = float(np.mean(edges > 0))
    mean_luma = float(np.mean(gray_s))
    contrast = float(np.std(gray_s))
    sharpness_score = max(lap_var, edge_density * 800.0)
    g_ratio = glare_ratio(bgr_s)
    metrics["sharpness"] = round(lap_var, 2)
    metrics["edgeDensity"] = round(edge_density, 4)
    metrics["sharpnessScore"] = round(sharpness_score, 2)
    metrics["brightness"] = round(mean_luma, 2)
    metrics["contrast"] = round(contrast, 2)
    metrics["glareRatio"] = round(g_ratio, 4)

    if sharpness_score < 28.0 and lap_var < 18.0:
        return QualityResult(
            ok=False,
            code="too_blurry",
            message="Photo looks blurry. Hold steady, tap to focus, and retake.",
            metrics=metrics,
            surface_ok=False,
            glare_ratio=g_ratio,
        )
    if mean_luma < 35.0:
        return QualityResult(
            ok=False,
            code="too_dark",
            message="Photo is too dark. Use even lighting and avoid shadows.",
            metrics=metrics,
            surface_ok=False,
            glare_ratio=g_ratio,
        )
    if mean_luma > 245.0:
        return QualityResult(
            ok=False,
            code="too_bright",
            message="Photo is overexposed. Reduce glare or bright reflections.",
            metrics=metrics,
            surface_ok=False,
            glare_ratio=g_ratio,
        )
    if contrast < 14.0:
        return QualityResult(
            ok=False,
            code="low_contrast",
            message="Low contrast — place the card on a contrasting solid background.",
            metrics=metrics,
            surface_ok=False,
            glare_ratio=g_ratio,
        )

    return QualityResult(ok=True, metrics=metrics, glare_ratio=g_ratio, surface_ok=True)


def assess_card_quality(
    card_bgr: np.ndarray,
    *,
    extraction: Any | None = None,
    raw_bgr: np.ndarray | None = None,
) -> QualityResult:
    """
    Post-rectification checks on the canonical card image.

    Does not hard-fail the whole grade. Sets surface_ok=False when glare,
    sleeve plastic, or lighting would make surface findings untrustworthy.
    """
    h, w = card_bgr.shape[:2]
    gray = cv2.cvtColor(card_bgr, cv2.COLOR_BGR2GRAY)
    g_ratio = glare_ratio(card_bgr)
    lighting_std = _block_luma_std(gray)
    shadow_frac = float(np.mean(gray < 42))
    sleeve = _sleeve_score(card_bgr)
    finish = classify_finish(card_bgr)
    mean_luma = float(np.mean(gray))
    tilt = float(getattr(extraction, "tilt_deg", 0.0) or 0.0) if extraction is not None else 0.0
    found = bool(getattr(extraction, "found", True)) if extraction is not None else True
    ext_conf = float(getattr(extraction, "confidence", 1.0) or 0.0) if extraction is not None else 1.0

    crop_margin = 1.0
    if extraction is not None and getattr(extraction, "corners", None) is not None and raw_bgr is not None:
        corners = np.asarray(extraction.corners, dtype=np.float32)
        rh, rw = raw_bgr.shape[:2]
        xs, ys = corners[:, 0], corners[:, 1]
        crop_margin = float(min(xs.min(), ys.min(), rw - xs.max(), rh - ys.max()) / max(1.0, min(rh, rw)))

    checks: list[QualityCheck] = []

    def add(cid: str, status: str, message: str, value: float | None = None) -> None:
        checks.append(QualityCheck(id=cid, status=status, message=message, value=value))

    if g_ratio >= GLARE_REFUSE:
        add(
            "glare",
            "fail",
            f"Surface analysis unreliable — glare detected over {g_ratio * 100:.0f}% of the card. "
            "Retake without reflections for a more accurate grade.",
            g_ratio,
        )
    elif g_ratio >= GLARE_WARN:
        add(
            "glare",
            "warn",
            f"Glare covers {g_ratio * 100:.0f}% of the card. Surface findings are less reliable.",
            g_ratio,
        )
    else:
        add("glare", "pass", "Glare is within a usable range.", g_ratio)

    if sleeve >= 0.55:
        add("sleeve", "fail", "Sleeve or toploader plastic detected. Photograph the card unsleeved.", sleeve)
    elif sleeve >= 0.32:
        add("sleeve", "warn", "Possible sleeve or toploader sheen. Surface may be overstated.", sleeve)
    else:
        add("sleeve", "pass", "No obvious sleeve/toploader sheen.", sleeve)

    if lighting_std >= 36:
        add("lighting", "fail", "Lighting is very uneven across the card. Use a single diffuse light.", lighting_std)
    elif lighting_std >= 22:
        add("lighting", "warn", "Uneven lighting. Move the light or retake on a matte background.", lighting_std)
    else:
        add("lighting", "pass", "Lighting looks even enough.", lighting_std)

    if shadow_frac >= 0.22 and mean_luma > 70:
        add("shadows", "warn", "Hard shadows cover part of the card.", shadow_frac)
    else:
        add("shadows", "pass", "No large shadow regions.", shadow_frac)

    if tilt >= 18:
        add("perspective", "warn", f"Camera is tilted ~{tilt:.0f}°. Hold more parallel to the card.", tilt)
    else:
        add("perspective", "pass", "Perspective looks usable.", tilt)

    if not found:
        add("card_visible", "warn", "Card boundary is uncertain. Fill the frame on a contrasting background.", ext_conf)
    elif crop_margin < 0.012:
        add("card_visible", "warn", "Card is clipped or too close to the frame edge.", crop_margin)
    else:
        add("card_visible", "pass", "Card appears fully in frame.", crop_margin)

    if min(h, w) < 400:
        add("resolution", "warn", "Warped card is low resolution; corner and edge crops will be coarse.", float(min(h, w)))
    else:
        add("resolution", "pass", "Resolution is adequate after rectification.", float(min(h, w)))

    if ext_conf < 0.35:
        add("crop", "warn", "Crop confidence is low. Re-frame so the full card is obvious.", ext_conf)
    else:
        add("crop", "pass", "Crop looks stable.", ext_conf)

    lap = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    if lap < 18:
        add("blur", "fail", "The rectified card is still soft. Tap to focus and retake.", lap)
    elif lap < 40:
        add("blur", "warn", "Focus is soft. Corner wear may be under- or over-stated.", lap)
    else:
        add("blur", "pass", "Focus looks usable.", lap)

    fail_ids = {c.id for c in checks if c.status == "fail"}
    surface_ok = "glare" not in fail_ids and "sleeve" not in fail_ids and "lighting" not in fail_ids
    if g_ratio >= GLARE_EXTREME:
        surface_ok = False
    if finish in ("standard-holo", "textured") and g_ratio >= GLARE_WARN:
        surface_ok = False

    surface_message = None
    if not surface_ok:
        glare_check = next((c for c in checks if c.id == "glare" and c.status == "fail"), None)
        sleeve_check = next((c for c in checks if c.id == "sleeve" and c.status == "fail"), None)
        light_check = next((c for c in checks if c.id == "lighting" and c.status == "fail"), None)
        if glare_check:
            surface_message = glare_check.message
        elif sleeve_check:
            surface_message = sleeve_check.message
        elif light_check:
            surface_message = light_check.message
        elif finish in ("standard-holo", "textured"):
            surface_message = (
                f"Holo/textured finish plus glare — surface is not scored from this photo. "
                f"Retake at a slight angle, out of direct reflection."
            )
        else:
            surface_message = "Surface analysis unreliable from this photo. Retake for a more accurate grade."

    metrics = {
        "width": float(w),
        "height": float(h),
        "glareRatio": round(g_ratio, 4),
        "lightingStd": round(lighting_std, 2),
        "shadowFrac": round(shadow_frac, 4),
        "sleeveScore": round(sleeve, 3),
        "tiltDeg": round(tilt, 2),
        "extractionConfidence": round(ext_conf, 3),
        "cropMargin": round(crop_margin, 4),
        "sharpness": round(lap, 2),
        "brightness": round(mean_luma, 2),
    }

    return QualityResult(
        ok=True,
        metrics=metrics,
        checks=checks,
        surface_ok=surface_ok,
        surface_message=surface_message,
        glare_ratio=g_ratio,
        finish_hint=finish,
        message=surface_message,
        code=None if surface_ok else "surface_unreliable",
    )


def quality_confidence_penalty(metrics: dict[str, float] | None) -> float:
    """Return a 0–1 multiplier for overall confidence from quality metrics."""
    if not metrics:
        return 0.85
    sharp = float(metrics.get("sharpness", 80))
    bright = float(metrics.get("brightness", 128))
    contrast = float(metrics.get("contrast", 40))
    glare = float(metrics.get("glareRatio", 0.0))

    sharp_score = min(1.0, sharp / 120.0)
    bright_score = 1.0 - min(1.0, abs(bright - 140) / 140.0)
    contrast_score = min(1.0, contrast / 50.0)
    glare_score = 1.0 - min(1.0, glare / GLARE_REFUSE)
    return float(
        np.clip(
            0.28 * sharp_score + 0.22 * bright_score + 0.22 * contrast_score + 0.28 * glare_score,
            0.28,
            1.0,
        )
    )

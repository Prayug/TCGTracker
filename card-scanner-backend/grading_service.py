"""
PSA-style AI card grading via computer vision.

Analyzes trading card images across four categories (each 1.0–10.0 half-point):
  Centering — border symmetry via PSA ratio table (worst-axis limits subgrade)
  Corners   — wear, whitening, and chips (not sharpness alone)
  Edges     — continuity + whitening (works on light borders)
  Surface   — scratches, clouding, plus crease / fold / tear detection

Structural damage (creases, tears) hard-caps surface and overall grade.
When both sides are provided, each category uses min(front, back).
totalScore = grade * 100 so existing "higher is better" sorting still works.
PSA-style estimate — not a substitute for professional grading.
"""

from __future__ import annotations

import base64
import uuid
from dataclasses import dataclass, field
from typing import Any

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter


# ── Grade mapping (PSA-style 1–10 half-point scale) ───────────────────────────

PSA_BANDS: list[tuple[float, str]] = [
    (9.5, "Gem Mint"),
    (8.5, "Mint"),
    (7.5, "NM-MT"),
    (6.5, "NM"),
    (5.5, "EX-MT"),
    (4.5, "EX"),
    (3.5, "VG-EX"),
    (2.5, "VG"),
    (1.5, "Good"),
    (1.0, "Fair"),
    (0.0, "Poor"),
]


def score_to_grade(grade: float) -> tuple[float, str]:
    """Map a numeric grade (1.0–10.0) to (grade, PSA label)."""
    grade = max(1.0, min(10.0, grade))
    for threshold, label in PSA_BANDS:
        if grade >= threshold:
            return grade, label
    return 1.0, "Poor"


def grade_to_condition(grade: float) -> str:
    """Map numeric grade to vault CardCondition values."""
    if grade >= 8.5:
        return "near-mint"
    if grade >= 7.0:
        return "lightly-played"
    if grade >= 5.0:
        return "moderately-played"
    if grade >= 3.0:
        return "heavily-played"
    return "damaged"


# ── Structural damage (creases / folds / tears) ────────────────────────────────

def _detect_structural_damage(card: np.ndarray) -> dict[str, Any]:
    """
    Detect creases, folds, and tears via long ridge lines that cut across the card.

    Creases appear as dark or whitened linear ridges spanning a large fraction of
    the card — something scratch/variance heuristics miss. Returns severity in
    [0, 1] plus counts used for hard grade caps.
    """
    gray = cv2.cvtColor(card, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    if min(h, w) < 80:
        return {
            "severity": 0.0,
            "crease_count": 0,
            "major_crease": False,
            "possible_tear": False,
            "line_mask": np.zeros((h, w), dtype=np.uint8),
        }

    m = max(4, min(h, w) // 25)
    inner = gray[m : h - m, m : w - m]
    ih, iw = inner.shape
    card_diag = float(np.hypot(ih, iw))

    smooth = cv2.bilateralFilter(inner, 7, 50, 50)
    k = max(15, (min(ih, iw) // 12) | 1)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    blackhat = cv2.morphologyEx(smooth, cv2.MORPH_BLACKHAT, kernel)
    tophat = cv2.morphologyEx(smooth, cv2.MORPH_TOPHAT, kernel)

    # Strong ridges relative to local response (not absolute Otsu — art fires that)
    def _ridge_mask(resp: np.ndarray) -> np.ndarray:
        med = float(np.median(resp))
        std = float(np.std(resp)) + 1e-6
        # Higher threshold to reduce false positives on artwork patterns
        thr = med + 2.8 * std
        return (resp > max(thr, 16.0)).astype(np.uint8) * 255

    ridge = cv2.bitwise_or(_ridge_mask(blackhat), _ridge_mask(tophat))

    # Prefer long continuous structures; kill speckles from print texture
    long_h = cv2.getStructuringElement(cv2.MORPH_RECT, (max(11, iw // 20), 1))
    long_v = cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(11, ih // 20)))
    ridge = cv2.bitwise_or(
        cv2.morphologyEx(ridge, cv2.MORPH_OPEN, long_h),
        cv2.morphologyEx(ridge, cv2.MORPH_OPEN, long_v),
    )
    ridge = cv2.dilate(ridge, cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)), iterations=1)

    min_len = int(min(ih, iw) * 0.35)
    lines = cv2.HoughLinesP(
        ridge,
        rho=1,
        theta=np.pi / 180,
        threshold=max(50, min(ih, iw) // 10),
        minLineLength=min_len,
        maxLineGap=max(6, min(ih, iw) // 35),
    )

    crease_count = 0
    max_len_frac = 0.0
    edge_touching = 0
    kept: list[tuple[int, int, int, int]] = []

    if lines is not None:
        for line in lines[:30]:
            pts = np.asarray(line).reshape(-1)
            if pts.size < 4:
                continue
            x1, y1, x2, y2 = map(int, pts[:4])
            length = float(np.hypot(x2 - x1, y2 - y1))
            len_frac = length / card_diag
            if len_frac < 0.22:
                continue

            # Sample intensity contrast across the line (crease signature)
            mx, my = (x1 + x2) / 2.0, (y1 + y2) / 2.0
            dx, dy = float(x2 - x1), float(y2 - y1)
            norm = float(np.hypot(dx, dy)) + 1e-6
            nx, ny = -dy / norm, dx / norm
            samples: list[float] = []
            for offset in (-4.0, -2.0, 0.0, 2.0, 4.0):
                sx = int(np.clip(mx + nx * offset, 0, iw - 1))
                sy = int(np.clip(my + ny * offset, 0, ih - 1))
                samples.append(float(inner[sy, sx]))
            contrast = max(samples) - min(samples)
            if contrast < 25 and len_frac < 0.50:
                continue  # weak texture line, not a crease

            crease_count += 1
            max_len_frac = max(max_len_frac, len_frac)
            kept.append((x1, y1, x2, y2))

            # Tear / severe crease often reaches a card edge
            margin = max(4, min(ih, iw) // 40)
            if (
                min(x1, x2) <= margin
                or max(x1, x2) >= iw - 1 - margin
                or min(y1, y2) <= margin
                or max(y1, y2) >= ih - 1 - margin
            ):
                edge_touching += 1

    major_crease = max_len_frac >= 0.55 or crease_count >= 3
    possible_tear = edge_touching >= 2 and (max_len_frac >= 0.45 or crease_count >= 3)

    # Severity 0–1 for soft penalties / caps
    severity = 0.0
    if crease_count:
        severity = min(
            1.0,
            0.35 * min(crease_count, 4)
            + 0.55 * min(max_len_frac / 0.7, 1.0)
            + (0.25 if possible_tear else 0.0),
        )

    full_mask = np.zeros((h, w), dtype=np.uint8)
    for x1, y1, x2, y2 in kept:
        cv2.line(full_mask, (x1 + m, y1 + m), (x2 + m, y2 + m), 255, 2)

    return {
        "severity": round(severity, 3),
        "crease_count": crease_count,
        "major_crease": major_crease,
        "possible_tear": possible_tear,
        "max_len_frac": round(max_len_frac, 3),
        "line_mask": full_mask,
    }


# ── PSA Centering ratio table ─────────────────────────────────────────────────

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
    """
    Map worst-axis centering ratio (e.g. 58 for 58/42) to a 1–10 subgrade
    using published PSA tolerances.
    """
    bands = FRONT_CENTERING_BANDS if is_front else BACK_CENTERING_BANDS
    for max_ok, grade in bands:
        if max_ratio_pct <= max_ok:
            return grade
    last_band = bands[-1]
    extra = (max_ratio_pct - last_band[0]) / 20.0
    return max(1.0, round(last_band[1] - extra, 1))


# ── Result types ──────────────────────────────────────────────────────────────

@dataclass
class CategoryResult:
    score: float
    details: str
    defects: list[str] = field(default_factory=list)
    deviations: dict[str, Any] | None = None
    crops: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "score": self.score,
            "details": self.details,
            "defects": self.defects,
        }
        if self.deviations is not None:
            d["deviations"] = self.deviations
        if self.crops:
            d["crops"] = self.crops
        return d


@dataclass
class GradingResult:
    id: str
    centering: CategoryResult
    corners: CategoryResult
    edges: CategoryResult
    surface: CategoryResult
    total_score: float
    grade: float
    grade_label: str
    suggested_condition: str
    defect_regions: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "centering": self.centering.to_dict(),
            "corners": self.corners.to_dict(),
            "edges": self.edges.to_dict(),
            "surface": self.surface.to_dict(),
            "totalScore": self.total_score,
            "grade": self.grade,
            "gradeLabel": self.grade_label,
            "suggestedCondition": self.suggested_condition,
            "defectRegions": self.defect_regions,
        }


# ── Image helpers ─────────────────────────────────────────────────────────────

def pil_to_cv(img: Image.Image) -> np.ndarray:
    if img.mode != "RGB":
        img = img.convert("RGB")
    arr = np.array(img)
    return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)


def encode_crop(region: np.ndarray, max_dim: int = 1800, quality: int = 95) -> str:
    """Encode a cropped region as a base64 JPEG data URL (high quality, sharp)."""
    if region.size == 0:
        return ""
    h, w = region.shape[:2]
    if max(h, w) > max_dim:
        scale = max_dim / max(h, w)
        region = cv2.resize(region, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    elif max(h, w) < max_dim // 2:
        # Upscale thin strips so details stay crisp
        scale = (max_dim // 2) / max(h, w)
        region = cv2.resize(region, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_CUBIC)
    _, buf = cv2.imencode(".jpg", region, [cv2.IMWRITE_JPEG_QUALITY, quality])
    b64 = base64.b64encode(buf).decode("ascii")
    return f"data:image/jpeg;base64,{b64}"


def encode_full_image(img: np.ndarray, max_dim: int = 1800, quality: int = 92) -> str:
    """Encode a full card image as a high-quality base64 JPEG data URL."""
    if img.size == 0:
        return ""
    h, w = img.shape[:2]
    if max(h, w) > max_dim:
        scale = max_dim / max(h, w)
        img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    _, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, quality])
    b64 = base64.b64encode(buf).decode("ascii")
    return f"data:image/jpeg;base64,{b64}"


def _expand_crop_region(x: int, y: int, rw: int, rh: int,
                         img_h: int, img_w: int, padding: float = 0.35) -> tuple[int, int, int, int]:
    """
    Expand a crop region by a padding factor (fraction of the region size) in each direction,
    clamped to image bounds. This shows surrounding context (non-card area) for better edge visibility.
    """
    pad_x = int(rw * padding)
    pad_y = int(rh * padding)
    nx = max(0, x - pad_x)
    ny = max(0, y - pad_y)
    nw = min(img_w - nx, rw + 2 * pad_x)
    nh = min(img_h - ny, rh + 2 * pad_y)
    return nx, ny, nw, nh


def _expand_crop_asymmetric(
    x: int, y: int, rw: int, rh: int,
    img_h: int, img_w: int,
    pad_left: int = 0, pad_right: int = 0,
    pad_top: int = 0, pad_bottom: int = 0,
) -> tuple[int, int, int, int]:
    """Expand a crop with independent padding on each side (TAG-style border context)."""
    nx = max(0, x - pad_left)
    ny = max(0, y - pad_top)
    nw = min(img_w - nx, rw + pad_left + pad_right)
    nh = min(img_h - ny, rh + pad_top + pad_bottom)
    return nx, ny, max(1, nw), max(1, nh)


def annotate_crosshair(region: np.ndarray, cx_ratio: float = 0.5, cy_ratio: float = 0.5,
                        color: tuple = (0, 200, 255), length: int = 20) -> np.ndarray:
    """Draw crosshair annotation on a crop image."""
    annotated = region.copy()
    h, w = annotated.shape[:2]
    cx = int(w * cx_ratio)
    cy = int(h * cy_ratio)
    length = max(8, min(length, min(w, h) // 4))
    cv2.line(annotated, (cx - length, cy), (cx + length, cy), color, 1, cv2.LINE_AA)
    cv2.line(annotated, (cx, cy - length), (cx, cy + length), color, 1, cv2.LINE_AA)
    cv2.circle(annotated, (cx, cy), 3, color, 1, cv2.LINE_AA)
    return annotated


def generate_centering_proof(
    display: np.ndarray,
    lr_pct: float,
    tb_pct: float,
    left: float,
    right: float,
    top: float,
    bottom: float,
    mx: int = 0,
    my: int = 0,
    card_w: int | None = None,
    card_h: int | None = None,
) -> str:
    """
    Centering proof on the ORIGINAL photo (no warp).
    Crops a padded window around the detected card so background is visible,
    then draws outer card outline + inner border measurements with PSA-style ratios.
    """
    dh, dw = display.shape[:2]
    cw = card_w if card_w is not None else dw - 2 * mx
    ch = card_h if card_h is not None else dh - 2 * my

    pad = max(24, int(min(cw, ch) * 0.10))
    x0 = max(0, mx - pad)
    y0 = max(0, my - pad)
    x1 = min(dw, mx + cw + pad)
    y1 = min(dh, my + ch + pad)
    proof = display[y0:y1, x0:x1].copy()
    ox, oy = mx - x0, my - y0

    left_pos = ox + int(left)
    right_pos = ox + cw - int(right)
    top_pos = oy + int(top)
    bottom_pos = oy + ch - int(bottom)

    cv2.rectangle(proof, (ox + 1, oy + 1), (ox + cw - 2, oy + ch - 2), (255, 255, 255), 2, cv2.LINE_AA)

    inner_color = (255, 200, 0)
    line_thickness = 2
    cv2.line(proof, (left_pos, oy), (left_pos, oy + ch), inner_color, line_thickness, cv2.LINE_AA)
    cv2.line(proof, (right_pos, oy), (right_pos, oy + ch), inner_color, line_thickness, cv2.LINE_AA)
    cv2.line(proof, (ox, top_pos), (ox + cw, top_pos), inner_color, line_thickness, cv2.LINE_AA)
    cv2.line(proof, (ox, bottom_pos), (ox + cw, bottom_pos), inner_color, line_thickness, cv2.LINE_AA)

    arrow_color = (0, 180, 255)
    mid_y = oy + ch // 2
    mid_x = ox + cw // 2
    if left_pos > ox + 4:
        cv2.arrowedLine(proof, (ox + 2, mid_y), (left_pos - 1, mid_y), arrow_color, 2, cv2.LINE_AA, tipLength=0.3)
    if right_pos < ox + cw - 4:
        cv2.arrowedLine(proof, (ox + cw - 3, mid_y), (right_pos + 1, mid_y), arrow_color, 2, cv2.LINE_AA, tipLength=0.3)
    if top_pos > oy + 4:
        cv2.arrowedLine(proof, (mid_x, oy + 2), (mid_x, top_pos - 1), arrow_color, 2, cv2.LINE_AA, tipLength=0.3)
    if bottom_pos < oy + ch - 4:
        cv2.arrowedLine(proof, (mid_x, oy + ch - 3), (mid_x, bottom_pos + 1), arrow_color, 2, cv2.LINE_AA, tipLength=0.3)

    overlay = proof.copy()
    border_highlight_color = (0, 255, 200)
    alpha = 0.10
    cv2.rectangle(overlay, (ox, oy), (left_pos, oy + ch), border_highlight_color, -1)
    cv2.rectangle(overlay, (right_pos, oy), (ox + cw, oy + ch), border_highlight_color, -1)
    cv2.rectangle(overlay, (left_pos, oy), (right_pos, top_pos), border_highlight_color, -1)
    cv2.rectangle(overlay, (left_pos, bottom_pos), (right_pos, oy + ch), border_highlight_color, -1)
    cv2.addWeighted(proof, 1 - alpha, overlay, alpha, 0, proof)

    cv2.line(proof, (left_pos, oy), (left_pos, oy + ch), inner_color, line_thickness, cv2.LINE_AA)
    cv2.line(proof, (right_pos, oy), (right_pos, oy + ch), inner_color, line_thickness, cv2.LINE_AA)
    cv2.line(proof, (ox, top_pos), (ox + cw, top_pos), inner_color, line_thickness, cv2.LINE_AA)
    cv2.line(proof, (ox, bottom_pos), (ox + cw, bottom_pos), inner_color, line_thickness, cv2.LINE_AA)
    cv2.rectangle(proof, (ox + 1, oy + 1), (ox + cw - 2, oy + ch - 2), (255, 255, 255), 2, cv2.LINE_AA)

    font = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = 0.55
    font_thickness = 1
    ph, pw = proof.shape[:2]

    lr_left = int(round(lr_pct))
    lr_right = 100 - lr_left
    tb_top = int(round(tb_pct))
    tb_bottom = 100 - tb_top
    lr_text = f"L/R {lr_left}/{lr_right}"
    tb_text = f"T/B {tb_top}/{tb_bottom}"

    (tw, th), _ = cv2.getTextSize(lr_text, font, font_scale, font_thickness)
    tx = ox + (cw - tw) // 2
    ty = max(th + 4, oy - 8) if oy > th + 6 else oy + th + 6
    cv2.putText(proof, lr_text, (tx + 1, ty + 1), font, font_scale, (0, 0, 0), font_thickness + 1, cv2.LINE_AA)
    cv2.putText(proof, lr_text, (tx, ty), font, font_scale, (0, 220, 255), font_thickness, cv2.LINE_AA)

    (tw, th), _ = cv2.getTextSize(tb_text, font, font_scale, font_thickness)
    tx = ox + (cw - tw) // 2
    ty = min(ph - 6, oy + ch + th + 6) if oy + ch + th + 8 < ph else oy + ch - 8
    cv2.putText(proof, tb_text, (tx + 1, ty + 1), font, font_scale, (0, 0, 0), font_thickness + 1, cv2.LINE_AA)
    cv2.putText(proof, tb_text, (tx, ty), font, font_scale, (0, 220, 255), font_thickness, cv2.LINE_AA)

    return encode_crop(proof, max_dim=2400, quality=95)


def generate_defect_highlight(card: np.ndarray, location: dict, category: str,
                               defect_text: str) -> str:
    """
    Highlighted crop for a specific defect. Uses light line markers (not thick orange bars)
    and generous context padding so the border + background remain visible.
    """
    h, w = card.shape[:2]
    x = int(location.get("x", 0) * w)
    y = int(location.get("y", 0) * h)
    rw = int(location.get("width", 0.25) * w)
    rh = int(location.get("height", 0.25) * h)

    x = max(0, min(x, w - 1))
    y = max(0, min(y, h - 1))
    rw = max(10, min(rw, w - x))
    rh = max(10, min(rh, h - y))

    # Prefer absolute padding based on the larger dimension so thin edge strips
    # still get a usable TAG-style viewport.
    base = max(rw, rh, 40)
    pad = max(24, int(base * 0.55))
    ex, ey, ew, eh = _expand_crop_asymmetric(
        x, y, rw, rh, h, w,
        pad_left=pad, pad_right=pad, pad_top=pad, pad_bottom=pad,
    )

    crop = card[ey:ey + eh, ex:ex + ew].copy()
    if crop.size == 0:
        return ""

    ch, cw = crop.shape[:2]
    color = {
        "centering": (255, 200, 0),
        "corners": (0, 200, 255),
        "edges": (0, 180, 255),
        "surface": (0, 100, 255),
    }.get(category, (0, 200, 255))

    # Subtle outer frame (1px) — never dominate the crop
    cv2.rectangle(crop, (0, 0), (cw - 1, ch - 1), color, 1, cv2.LINE_AA)

    # Mark the original ROI with a thin dashed-feel rectangle
    ix = max(0, x - ex)
    iy = max(0, y - ey)
    cv2.rectangle(
        crop,
        (ix, iy),
        (min(cw - 1, ix + rw), min(ch - 1, iy + rh)),
        (0, 255, 255),
        1,
        cv2.LINE_AA,
    )

    # Small L-markers at ROI corners only
    marker_len = max(6, min(cw, ch) // 12)
    for cx0, cy0 in [(ix, iy), (ix + rw, iy), (ix, iy + rh), (ix + rw, iy + rh)]:
        cx0 = int(np.clip(cx0, 0, cw - 1))
        cy0 = int(np.clip(cy0, 0, ch - 1))
        dx = marker_len if cx0 <= ix + rw // 2 else -marker_len
        dy = marker_len if cy0 <= iy + rh // 2 else -marker_len
        cv2.line(crop, (cx0, cy0), (int(np.clip(cx0 + dx, 0, cw - 1)), cy0), color, 1, cv2.LINE_AA)
        cv2.line(crop, (cx0, cy0), (cx0, int(np.clip(cy0 + dy, 0, ch - 1))), color, 1, cv2.LINE_AA)

    font = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = 0.35
    font_thickness = 1
    label = defect_text[:36]
    (tw, th), _ = cv2.getTextSize(label, font, font_scale, font_thickness)
    text_x = max(2, (cw - tw) // 2)
    text_y = ch - 4
    cv2.rectangle(crop, (text_x - 2, text_y - th - 2), (text_x + tw + 2, text_y + 2), (0, 0, 0), -1)
    cv2.putText(crop, label, (text_x, text_y), font, font_scale, (255, 255, 255), font_thickness, cv2.LINE_AA)

    return encode_crop(crop, max_dim=1400, quality=95)


def severity_from_score(score: float, threshold_good: float = 9.0, threshold_ok: float = 7.0) -> str:
    if score >= threshold_good:
        return "minor"
    if score >= threshold_ok:
        return "moderate"
    return "severe"


def find_card_contour(gray: np.ndarray) -> np.ndarray | None:
    """Legacy Canny contour finder — prefer detect_card_bbox for outer edges."""
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel, iterations=2)
    contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    h, w = gray.shape
    img_area = h * w
    best = None
    best_area = 0
    for c in contours:
        area = cv2.contourArea(c)
        if area < img_area * 0.15 or area > img_area * 0.98:
            continue
        peri = cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, 0.02 * peri, True)
        if len(approx) >= 4 and area > best_area:
            best = approx
            best_area = area
    return best


def order_corners(pts: np.ndarray) -> np.ndarray:
    """Order 4 points as TL, TR, BR, BL."""
    pts = pts.reshape(-1, 2).astype(np.float32)
    if len(pts) > 4:
        rect = cv2.minAreaRect(pts)
        pts = cv2.boxPoints(rect).astype(np.float32)

    s = pts.sum(axis=1)
    diff = np.diff(pts, axis=1).flatten()
    tl = pts[np.argmin(s)]
    br = pts[np.argmax(s)]
    tr = pts[np.argmin(diff)]
    bl = pts[np.argmax(diff)]
    return np.array([tl, tr, br, bl], dtype=np.float32)


def _sample_background_color(bgr: np.ndarray) -> np.ndarray:
    """Estimate table/background color from image corners (assumes card is centered)."""
    h, w = bgr.shape[:2]
    sw, sh = max(4, w // 12), max(4, h // 12)
    patches = [
        bgr[0:sh, 0:sw],
        bgr[0:sh, w - sw : w],
        bgr[h - sh : h, 0:sw],
        bgr[h - sh : h, w - sw : w],
    ]
    samples = np.concatenate([p.reshape(-1, 3) for p in patches], axis=0)
    bg_median = np.median(samples, axis=0).astype(np.float32)

    # Check if card fills frame: corners may contain card pixels
    center = bgr[h // 3 : 2 * h // 3, w // 3 : 2 * w // 3]
    center_color = np.median(center.reshape(-1, 3), axis=0).astype(np.float32)
    if np.linalg.norm(bg_median.astype(float) - center_color.astype(float)) < 15:
        # Use the brightest corner patch as best background estimate
        brightness = [float(np.mean(p)) for p in patches]
        brightest = patches[int(np.argmax(brightness))]
        return np.median(brightest.reshape(-1, 3), axis=0).astype(np.float32)

    return bg_median


def _lab_distance_to_background(bgr: np.ndarray, bg: np.ndarray | None = None) -> np.ndarray:
    """Per-pixel Lab distance from the corner-sampled background color."""
    if bg is None:
        bg = _sample_background_color(bgr)
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    bg_lab = cv2.cvtColor(np.uint8([[bg]]), cv2.COLOR_BGR2LAB).astype(np.float32)[0, 0]
    return np.linalg.norm(lab - bg_lab, axis=2)


def _grabcut_from_rect(bgr: np.ndarray, rect: tuple[int, int, int, int]) -> np.ndarray:
    """
    GrabCut refined to a loose rectangle around the card.
    Returns 0/255 foreground mask.
    """
    h, w = bgr.shape[:2]
    x, y, bw, bh = rect
    # Expand rect slightly so GrabCut can see background just outside the card
    pad = max(8, int(min(bw, bh) * 0.04))
    rx = max(0, x - pad)
    ry = max(0, y - pad)
    rw = min(w - rx, bw + 2 * pad)
    rh = min(h - ry, bh + 2 * pad)
    if rw < 40 or rh < 40:
        return np.zeros((h, w), dtype=np.uint8)

    mask = np.zeros((h, w), dtype=np.uint8)
    bgd_model = np.zeros((1, 65), np.float64)
    fgd_model = np.zeros((1, 65), np.float64)
    try:
        cv2.grabCut(
            bgr, mask, (rx, ry, rw, rh), bgd_model, fgd_model, 5, cv2.GC_INIT_WITH_RECT
        )
    except cv2.error:
        return np.zeros((h, w), dtype=np.uint8)

    fg = np.where(
        (mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD),
        255,
        0,
    ).astype(np.uint8)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, kernel, iterations=2)
    return fg


def _lab_foreground_mask(bgr: np.ndarray) -> np.ndarray:
    """Lab-distance foreground mask vs corner-sampled background."""
    h, w = bgr.shape[:2]
    dist = _lab_distance_to_background(bgr)
    sh, sw = max(4, h // 12), max(4, w // 12)
    corner_dist = np.concatenate([
        dist[0:sh, 0:sw].ravel(),
        dist[0:sh, w - sw : w].ravel(),
        dist[h - sh : h, 0:sw].ravel(),
        dist[h - sh : h, w - sw : w].ravel(),
    ])
    floor = float(np.percentile(corner_dist, 85))
    thresh = max(12.0, floor * 1.8 + 6.0)
    mask = (dist > thresh).astype(np.uint8) * 255
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    mask = cv2.morphologyEx(
        mask, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)), iterations=1
    )
    return mask


def _largest_cardish_bbox(mask: np.ndarray) -> tuple[int, int, int, int] | None:
    h, w = mask.shape
    img_area = h * w
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None
    best = None
    best_score = -1.0
    for c in contours:
        area = cv2.contourArea(c)
        if area < img_area * 0.08 or area > img_area * 0.97:
            continue
        x, y, bw, bh = cv2.boundingRect(c)
        if bw < 40 or bh < 40:
            continue
        aspect = bh / float(bw)
        aspect_ok = 1.05 <= aspect <= 1.85 or 0.55 <= aspect <= 0.95
        if not aspect_ok:
            continue
        fill = area / float(bw * bh + 1e-6)
        score = area * (0.5 + 0.5 * min(fill, 1.0))
        score *= 1.0 - min(abs(aspect - 1.4), abs(aspect - 0.71)) * 0.15
        if score > best_score:
            best_score = score
            best = (x, y, bw, bh)
    if best is None:
        c = max(contours, key=cv2.contourArea)
        if cv2.contourArea(c) < img_area * 0.08:
            return None
        best = cv2.boundingRect(c)
    return best


def _foreground_mask(bgr: np.ndarray) -> np.ndarray:
    """
    Binary mask separating card from background.

    1) Lab distance vs corner background (captures yellow/foil borders well)
    2) GrabCut seeded from that rectangle (rejects table bleed without eating borders)
    """
    lab_mask = _lab_foreground_mask(bgr)
    rough = _largest_cardish_bbox(lab_mask)
    if rough is None:
        return lab_mask

    grab = _grabcut_from_rect(bgr, rough)
    grab_area = float(np.count_nonzero(grab))
    img_area = float(bgr.shape[0] * bgr.shape[1])
    if grab_area < img_area * 0.08:
        return lab_mask

    # Union keeps thin borders GrabCut may drop; then take largest cardish blob
    fused = cv2.bitwise_or(lab_mask, grab)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    fused = cv2.morphologyEx(fused, cv2.MORPH_CLOSE, kernel, iterations=2)

    # If fusion balloons past 90% of the frame, GrabCut spilled — stick with Lab
    if float(np.count_nonzero(fused)) > img_area * 0.90:
        return lab_mask
    return fused


def _refine_side_edge(
    gray: np.ndarray,
    dist: np.ndarray,
    rough: tuple[int, int, int, int],
    side: str,
    bg_thresh: float,
    search: int | None = None,
) -> int:
    """
    Snap one side of a rough AABB to the physical card/background boundary.

    Uses Lab-distance-from-background transitions. Inward movement is tightly
    capped so holofoil/art edges cannot pull the box inside the card; outward
    movement remains free to include clipped borders.
    """
    h, w = gray.shape
    x, y, bw, bh = rough
    if search is None:
        search = max(24, int(min(bw, bh) * 0.12))
    # How far we may move inward from the mask contour (halo cleanup only)
    max_inward = max(3, int(min(bw, bh) * 0.012))

    def _pick_transition(
        bg_profile: np.ndarray,
        grad_profile: np.ndarray,
        outward_is_low_idx: bool,
        rough_idx: int,
    ) -> int:
        n = len(bg_profile)
        if n < 4:
            return int(np.clip(rough_idx, 0, max(0, n - 1)))
        k = np.ones(3) / 3.0
        bg_s = np.convolve(bg_profile, k, mode="same")
        g_s = np.convolve(grad_profile, k, mode="same") if grad_profile.size == n else np.zeros(n)

        diff = np.diff(bg_s, prepend=bg_s[0])
        if not outward_is_low_idx:
            diff = -diff

        scores = np.abs(diff) * (1.0 + 0.35 * (g_s / (float(g_s.max()) + 1e-6)))
        # Strong proximity prior to the mask edge — art transitions are usually elsewhere
        xs = np.arange(n, dtype=np.float32)
        sigma = max(5.0, search * 0.28)
        scores = scores * (0.20 + 0.80 * np.exp(-0.5 * ((xs - float(rough_idx)) / sigma) ** 2))

        for i in range(1, n - 1):
            if outward_is_low_idx:
                outside_ok = bg_s[max(0, i - 2)] < bg_thresh * 1.15
                inside_ok = bg_s[min(n - 1, i + 1)] > bg_thresh * 0.85
            else:
                outside_ok = bg_s[min(n - 1, i + 2)] < bg_thresh * 1.15
                inside_ok = bg_s[max(0, i - 1)] > bg_thresh * 0.85
            if not (outside_ok and inside_ok):
                scores[i] *= 0.20

        best = int(np.argmax(scores))
        rough_i = int(np.clip(rough_idx, 0, n - 1))
        # If the best score is weak vs the rough location, keep the mask edge
        if scores[best] < max(scores[rough_i] * 1.25, float(np.median(scores)) * 2.5):
            return rough_i
        return best

    if side == "left":
        x0, x1 = max(0, x - search), min(w - 1, x + search)
        y0, y1 = y + int(bh * 0.18), y + int(bh * 0.82)
        if x1 - x0 < 4 or y1 - y0 < 8:
            return x
        band_g = gray[y0:y1, x0:x1].astype(np.float32)
        band_d = dist[y0:y1, x0:x1]
        bg_prof = band_d.mean(axis=0)
        grad = np.abs(np.diff(band_g, axis=1, prepend=band_g[:, :1])).mean(axis=0)
        rough_idx = int(np.clip(x - x0, 0, len(bg_prof) - 1))
        peak = x0 + _pick_transition(bg_prof, grad, True, rough_idx)
        # Clamp: free outward, limited inward
        return int(np.clip(peak, x - search, x + max_inward))

    if side == "right":
        xr = x + bw
        x0, x1 = max(0, xr - search), min(w - 1, xr + search)
        y0, y1 = y + int(bh * 0.18), y + int(bh * 0.82)
        if x1 - x0 < 4 or y1 - y0 < 8:
            return xr
        band_g = gray[y0:y1, x0:x1].astype(np.float32)
        band_d = dist[y0:y1, x0:x1]
        bg_prof = band_d.mean(axis=0)
        grad = np.abs(np.diff(band_g, axis=1, prepend=band_g[:, :1])).mean(axis=0)
        rough_idx = int(np.clip(xr - x0 - 1, 0, len(bg_prof) - 1))
        peak = x0 + _pick_transition(bg_prof, grad, False, rough_idx)
        return int(np.clip(peak, xr - max_inward, xr + search))

    if side == "top":
        y0, y1 = max(0, y - search), min(h - 1, y + search)
        x0, x1 = x + int(bw * 0.18), x + int(bw * 0.82)
        if y1 - y0 < 4 or x1 - x0 < 8:
            return y
        band_g = gray[y0:y1, x0:x1].astype(np.float32)
        band_d = dist[y0:y1, x0:x1]
        bg_prof = band_d.mean(axis=1)
        grad = np.abs(np.diff(band_g, axis=0, prepend=band_g[:1, :])).mean(axis=1)
        rough_idx = int(np.clip(y - y0, 0, len(bg_prof) - 1))
        peak = y0 + _pick_transition(bg_prof, grad, True, rough_idx)
        return int(np.clip(peak, y - search, y + max_inward))

    yb = y + bh
    y0, y1 = max(0, yb - search), min(h - 1, yb + search)
    x0, x1 = x + int(bw * 0.18), x + int(bw * 0.82)
    if y1 - y0 < 4 or x1 - x0 < 8:
        return yb
    band_g = gray[y0:y1, x0:x1].astype(np.float32)
    band_d = dist[y0:y1, x0:x1]
    bg_prof = band_d.mean(axis=1)
    grad = np.abs(np.diff(band_g, axis=0, prepend=band_g[:1, :])).mean(axis=1)
    rough_idx = int(np.clip(yb - y0 - 1, 0, len(bg_prof) - 1))
    peak = y0 + _pick_transition(bg_prof, grad, False, rough_idx)
    return int(np.clip(peak, yb - max_inward, yb + search))


def detect_card_bbox(bgr: np.ndarray) -> tuple[int, int, int, int] | None:
    """
    Find the outer card rectangle by separating the card from the background,
    then snap each side to the physical card/table boundary.
    """
    h, w = bgr.shape[:2]
    mask = _foreground_mask(bgr)
    dist = _lab_distance_to_background(bgr)

    sh, sw = max(4, h // 12), max(4, w // 12)
    corner_dist = np.concatenate([
        dist[0:sh, 0:sw].ravel(),
        dist[0:sh, w - sw : w].ravel(),
        dist[h - sh : h, 0:sw].ravel(),
        dist[h - sh : h, w - sw : w].ravel(),
    ])
    bg_thresh = max(14.0, float(np.percentile(corner_dist, 90)) * 1.6 + 8.0)

    best = _largest_cardish_bbox(mask)
    if best is None:
        return None

    x, y, bw, bh = best
    roi = mask[y : y + bh, x : x + bw]
    ys, xs = np.where(roi > 0)
    if len(xs) > 0 and len(ys) > 0:
        x = x + int(xs.min())
        y = y + int(ys.min())
        bw = int(xs.max() - xs.min()) + 1
        bh = int(ys.max() - ys.min()) + 1

    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    rough = (x, y, bw, bh)
    lx = _refine_side_edge(gray, dist, rough, "left", bg_thresh)
    rx = _refine_side_edge(gray, dist, rough, "right", bg_thresh)
    ty = _refine_side_edge(gray, dist, rough, "top", bg_thresh)
    by = _refine_side_edge(gray, dist, rough, "bottom", bg_thresh)

    if rx - lx < 40 or by - ty < 40:
        return (x, y, bw, bh)

    pad = 1
    lx = max(0, lx - pad)
    ty = max(0, ty - pad)
    rx = min(w, rx + pad)
    by = min(h, by + pad)
    return (lx, ty, rx - lx, by - ty)


def prepare_card_view(
    bgr: np.ndarray,
    context_margin: float = 0.08,
) -> tuple[np.ndarray, np.ndarray, bool, dict[str, int]]:
    """
    Prepare views for grading.

    Prefer original photo + tight bbox so proofs show real background outside the
    card. Only fall back to a full perspective warp when bbox detection fails or
    the card is heavily rotated.
    """
    h, w = bgr.shape[:2]

    bbox = detect_card_bbox(bgr)
    warped, warp_ok, angle_deg = detect_card_perspective(bgr, return_angle=True)

    # Heavy rotation: warp everything so borders aren't diagonally sampled
    if warp_ok and warped is not None and angle_deg >= 4.0:
        card_h, card_w = warped.shape[:2]
        return warped, warped, True, {"mx": 0, "my": 0, "card_w": card_w, "card_h": card_h}

    if bbox is not None:
        x, y, bw, bh = bbox
        card = bgr[y : y + bh, x : x + bw].copy()
        return bgr, card, True, {"mx": x, "my": y, "card_w": bw, "card_h": bh}

    if warp_ok and warped is not None:
        card_h, card_w = warped.shape[:2]
        return warped, warped, True, {"mx": 0, "my": 0, "card_w": card_w, "card_h": card_h}

    inset_x = int(w * 0.08)
    inset_y = int(h * 0.08)
    x, y = inset_x, inset_y
    bw, bh = w - 2 * inset_x, h - 2 * inset_y
    card = bgr[y : y + bh, x : x + bw].copy()
    return bgr, card, False, {"mx": x, "my": y, "card_w": bw, "card_h": bh}


def detect_card_perspective(
    bgr: np.ndarray,
    return_angle: bool = False,
) -> tuple:
    """
    Find the card via foreground mask / Canny contours + minAreaRect, then warp.

    Returns (warped, success) or (warped, success, abs_rotation_degrees) when
    return_angle=True.
    """
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    h, w = bgr.shape[:2]
    img_area = h * w

    candidates = [_foreground_mask(bgr)]

    _, otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    candidates.append(otsu)

    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edged = cv2.Canny(blurred, 30, 100)
    kernel_close = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
    closed = cv2.morphologyEx(edged, cv2.MORPH_CLOSE, kernel_close, iterations=2)
    candidates.append(closed)

    best_corners = None
    best_area = 0
    best_angle = 0.0

    for binary in candidates:
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for c in contours:
            area = cv2.contourArea(c)
            if area < img_area * 0.12 or area > img_area * 0.98:
                continue
            rect = cv2.minAreaRect(c)
            box = order_corners(cv2.boxPoints(rect))

            bbox_w = float(np.linalg.norm(box[1] - box[0]))
            bbox_h = float(np.linalg.norm(box[2] - box[1]))
            if bbox_w < 40 or bbox_h < 40:
                continue
            aspect = max(bbox_h, bbox_w) / min(bbox_h, bbox_w)
            if aspect < 1.15 or aspect > 1.70:
                continue

            if area > best_area:
                best_area = area
                best_corners = box
                # minAreaRect angle is in [-90, 0). Convert to absolute tilt
                # from axis-aligned (0 = upright).
                rw, rh = float(rect[1][0]), float(rect[1][1])
                ang = float(rect[2])
                if rw < rh:
                    tilt = ang + 90.0
                else:
                    tilt = ang
                # Normalize to [-45, 45]
                while tilt > 45.0:
                    tilt -= 90.0
                while tilt < -45.0:
                    tilt += 90.0
                best_angle = abs(tilt)

    if best_corners is None:
        if return_angle:
            return None, False, 0.0
        return None, False

    dst_w = int(max(
        np.linalg.norm(best_corners[1] - best_corners[0]),
        np.linalg.norm(best_corners[2] - best_corners[3]),
    ))
    dst_h = int(max(
        np.linalg.norm(best_corners[3] - best_corners[0]),
        np.linalg.norm(best_corners[2] - best_corners[1]),
    ))
    dst = np.array(
        [[0, 0], [dst_w - 1, 0], [dst_w - 1, dst_h - 1], [0, dst_h - 1]],
        dtype=np.float32,
    )
    M = cv2.getPerspectiveTransform(best_corners, dst)
    warped = cv2.warpPerspective(bgr, M, (dst_w, dst_h))
    # Normalize to portrait if the warp came out landscape
    if warped.shape[1] > warped.shape[0]:
        warped = cv2.rotate(warped, cv2.ROTATE_90_CLOCKWISE)
    if return_angle:
        return warped, True, best_angle
    return warped, True


# Back-compat alias — callers that still say warp_card get the non-warping path
def warp_card(
    bgr: np.ndarray,
    contour: np.ndarray | None = None,
    context_margin: float = 0.18,
) -> tuple[np.ndarray, np.ndarray, bool, dict[str, int]]:
    """Deprecated name: does NOT warp. See prepare_card_view."""
    return prepare_card_view(bgr, context_margin=context_margin)


def preprocess_image(img: Image.Image) -> Image.Image:
    """Standard image preprocessing: sharpen + contrast boost."""
    img = img.convert("RGB")
    img = img.filter(ImageFilter.UnsharpMask(radius=2, percent=120, threshold=3))
    enhancer = ImageEnhance.Contrast(img)
    img = enhancer.enhance(1.25)
    return img


# ── Category analyzers ────────────────────────────────────────────────────────

def _find_border_transition(gray: np.ndarray, edge_slice: np.ndarray, axis: int,
                             window: int = 8, threshold_ratio: float = 2.5) -> int:
    """
    Find where a solid-color border transitions to multicolored art.
    Scans inward from an edge using a sliding window variance profile.
    Returns the pixel offset from the edge where the transition occurs.
    """
    if edge_slice.size == 0 or edge_slice.shape[axis] < window:
        return 0

    n_positions = edge_slice.shape[axis]
    variances = []
    for i in range(n_positions):
        if axis == 0:
            region = edge_slice[i:min(i + window, n_positions), :]
        else:
            region = edge_slice[:, i:min(i + window, n_positions)]
        if region.size == 0:
            variances.append(0.0)
        else:
            variances.append(float(np.std(region.astype(np.float32))))

    if len(variances) < 3:
        return 0

    var_arr = np.array(variances)
    kernel_size = min(5, len(var_arr))
    kernel = np.ones(kernel_size) / kernel_size
    smoothed = np.convolve(var_arr, kernel, mode="same")

    baseline_window = min(8, len(smoothed) // 3)
    if baseline_window < 2:
        baseline_window = 2
    baseline = float(np.median(smoothed[:baseline_window]))
    threshold = max(baseline * threshold_ratio, 8.0)
    for i in range(baseline_window, len(smoothed)):
        if smoothed[i] > threshold:
            return i

    grad = np.abs(np.diff(smoothed))
    if grad.max() > 3.0:
        return int(np.argmax(grad)) + 1
    return 0


def _border_width_from_scanline(
    line_lab: np.ndarray,
    max_scan: int,
    sample_end: int = 4,
    thr: float = 16.0,
    bg_lab: np.ndarray | None = None,
    bg_thr: float = 18.0,
) -> int:
    """
    Measure border width on one scanline (Lab pixels ordered outer→inward).
    Skips leading background pixels if the crop slightly overshoots the card.
    """
    n = min(max_scan, len(line_lab))
    if n < sample_end + 2:
        return 0
    line = line_lab[:n].astype(np.float32)

    # Skip background halo at the start of the scan
    start0 = 0
    if bg_lab is not None:
        for i in range(min(8, n // 3)):
            if float(np.linalg.norm(line[i] - bg_lab)) > bg_thr:
                start0 = i
                break
        else:
            start0 = 0

    sample_lo = start0 + 1
    sample_hi = min(n, start0 + sample_end)
    if sample_hi - sample_lo < 2:
        sample_lo = start0
        sample_hi = min(n, start0 + sample_end)

    sample = line[sample_lo:sample_hi]
    keep = sample[:, 0] < 200
    if int(keep.sum()) >= 2:
        ref = np.median(sample[keep], axis=0)
    else:
        ref = np.median(sample, axis=0)

    dists = np.linalg.norm(line - ref, axis=1)
    L = line[:, 0]
    L_ref = float(ref[0])
    start = max(sample_hi, start0 + 2)
    for i in range(start, n - 2):
        color_hit = dists[i] > thr and float(np.mean(dists[i : i + 2])) > thr * 0.85
        lum_hit = abs(float(L[i]) - L_ref) > max(18.0, thr * 0.9) and abs(
            float(np.mean(L[i : i + 2])) - L_ref
        ) > max(14.0, thr * 0.7)
        if color_hit or lum_hit:
            return int(max(0, i - start0))
    return int(max(0, int(np.argmax(dists[start:]) + start) - start0))


def _detect_card_borders(card_bgr: np.ndarray) -> dict[str, int]:
    """
    Detect inner border widths (outer edge → art) for all 4 sides.

    Uses per-scanline Lab distance from the outer border color, then takes a
    robust central value across the side (excluding corners). Works for classic
    solid borders and thin full-art/foil frames.
    """
    lab = cv2.cvtColor(card_bgr, cv2.COLOR_BGR2LAB)
    h, w = lab.shape[:2]
    max_scan = max(12, int(min(w, h) * 0.12))
    max_scan = min(max_scan, min(w, h) // 2)
    step = max(2, min(h, w) // 120)
    edge_strip = max(3, min(w, h) // 50)

    # Corner samples catch background halo when the outer crop is slightly loose
    corner_pix = np.concatenate([
        lab[0:2, 0:2].reshape(-1, 3),
        lab[0:2, -2:].reshape(-1, 3),
        lab[-2:, 0:2].reshape(-1, 3),
        lab[-2:, -2:].reshape(-1, 3),
    ], axis=0).astype(np.float32)
    bg_lab = np.median(corner_pix, axis=0)
    bg_thr = 18.0

    def _side_noise(side: str) -> float:
        if side == "left":
            patch = lab[int(h * 0.25) : int(h * 0.75), 1:edge_strip]
        elif side == "right":
            patch = lab[int(h * 0.25) : int(h * 0.75), w - edge_strip : w - 1]
        elif side == "top":
            patch = lab[1:edge_strip, int(w * 0.25) : int(w * 0.75)]
        else:
            patch = lab[h - edge_strip : h - 1, int(w * 0.25) : int(w * 0.75)]
        if patch.size < 12:
            return 20.0
        flat = patch.reshape(-1, 3).astype(np.float32)
        # Ignore specular pixels when estimating border uniformity
        flat = flat[flat[:, 0] < 200]
        if flat.size < 12:
            return 22.0
        med = np.median(flat, axis=0)
        return float(np.median(np.linalg.norm(flat - med, axis=1)))

    def _measure(side: str) -> int:
        noise = _side_noise(side)
        thr = float(np.clip(max(12.0, noise * 1.25 + 7.0), 12.0, 26.0))
        sample_end = 4 if noise < 18 else 5
        widths: list[int] = []

        if side in ("left", "right"):
            y0, y1 = int(h * 0.20), int(h * 0.80)
            for y in range(y0, y1, step):
                if side == "left":
                    line = lab[y, :max_scan]
                else:
                    line = lab[y, w - 1 : w - max_scan - 1 : -1]
                widths.append(
                    _border_width_from_scanline(
                        line, max_scan, sample_end, thr, bg_lab=bg_lab, bg_thr=bg_thr
                    )
                )
        else:
            x0, x1 = int(w * 0.20), int(w * 0.80)
            for x in range(x0, x1, step):
                if side == "top":
                    line = lab[:max_scan, x]
                else:
                    line = lab[h - 1 : h - max_scan - 1 : -1, x]
                widths.append(
                    _border_width_from_scanline(
                        line, max_scan, sample_end, thr, bg_lab=bg_lab, bg_thr=bg_thr
                    )
                )

        if not widths:
            return 0
        arr = np.array(widths, dtype=np.float32)
        med = float(np.median(arr))
        q25 = float(np.percentile(arr, 25))
        q75 = float(np.percentile(arr, 75))
        iqr = q75 - q25
        # Only bias low when the distribution is clearly skewed high (glare tails)
        if iqr > max(8.0, med * 0.55) and q75 > med * 1.35:
            width = int(round((med + q25) * 0.5))
        else:
            mad = float(np.median(np.abs(arr - med))) + 1e-6
            keep = arr[np.abs(arr - med) <= max(5.0, 2.5 * mad)]
            width = int(round(float(np.median(keep if keep.size else arr))))

        lo = max(2, int(min(w, h) * 0.006))
        hi = max(lo + 1, int(min(w, h) * 0.12))
        return int(np.clip(width, lo, hi))

    borders = {
        "left": _measure("left"),
        "right": _measure("right"),
        "top": _measure("top"),
        "bottom": _measure("bottom"),
    }

    # Soft symmetry check for thin foil frames poisoned by glare on one side
    for a, b in (("left", "right"), ("top", "bottom")):
        wa, wb = borders[a], borders[b]
        if min(wa, wb) <= 0:
            continue
        ratio = max(wa, wb) / float(min(wa, wb))
        thick = max(wa, wb) > int(min(w, h) * 0.055)
        if ratio > 3.0 and not thick:
            bigger = a if wa > wb else b
            smaller = b if wa > wb else a
            borders[bigger] = int(round(borders[smaller] * 2.4))

    return borders


def analyze_centering(
    card: np.ndarray,
    annotate: bool = True,
    display: np.ndarray | None = None,
    meta: dict[str, int] | None = None,
    is_front: bool = True,
) -> CategoryResult:
    """
    Measure border symmetry using PSA centering ratio table.
    Worst-axis ratio determines the centering subgrade.
    """
    h, w = card.shape[:2]

    borders = _detect_card_borders(card)
    left = float(borders["left"])
    right = float(borders["right"])
    top = float(borders["top"])
    bottom = float(borders["bottom"])

    # PSA-style ratios: larger share / smaller share (e.g. 58/42)
    lr_pct = (left / (left + right + 1e-6)) * 100
    tb_pct = (top / (top + bottom + 1e-6)) * 100

    # Worst axis (larger share) determines centering subgrade
    lr_max = max(lr_pct, 100 - lr_pct)
    tb_max = max(tb_pct, 100 - tb_pct)
    worst_max = max(lr_max, tb_max)

    # Map to PSA centering subgrade
    centering_subgrade = centering_ratio_to_subgrade(int(round(worst_max)), is_front=is_front)

    # Details string with PSA ratio format
    lr_left = int(round(lr_pct))
    lr_right = 100 - lr_left
    tb_top = int(round(tb_pct))
    tb_bottom = 100 - tb_top

    defects: list[str] = []
    if centering_subgrade < 9.0:
        if lr_max > 55:
            side = "left" if lr_pct > 50 else "right"
            defects.append(f"Off-center horizontally (favors {side} border: {lr_left}/{lr_right})")
        if tb_max > 55:
            side = "top" if tb_pct > 50 else "bottom"
            defects.append(f"Off-center vertically (favors {side} border: {tb_top}/{tb_bottom})")
    if centering_subgrade < 7.0:
        defects.append("Significant centering imbalance")

    details = (
        f"L/R {lr_left}/{lr_right} · T/B {tb_top}/{tb_bottom}. "
        f"{'Excellent centering.' if centering_subgrade >= 9.5 else 'Good centering.' if centering_subgrade >= 8.0 else 'Noticeable off-center.'}"
    )

    crops: list[dict[str, Any]] = []
    if annotate:
        viz = display if display is not None else card
        vh, vw = viz.shape[:2]
        mx = (meta or {}).get("mx", 0)
        my = (meta or {}).get("my", 0)

        out_pad = max(20, int(min(h, w) * 0.10))
        in_pad = max(40, int(min(h, w) * 0.15))

        # Left border crop
        lx0, ly0, lw, lh = _expand_crop_asymmetric(
            mx, my, max(1, int(left) + 2), h,
            vh, vw, pad_left=out_pad, pad_right=in_pad, pad_top=out_pad // 2, pad_bottom=out_pad // 2,
        )
        crops.append({
            "label": "Left border",
            "image": encode_crop(viz[ly0:ly0 + lh, lx0:lx0 + lw]),
            "location": {"x": lx0 / vw, "y": ly0 / vh, "width": lw / vw, "height": lh / vh},
        })

        # Right border crop
        rx = mx + w - max(1, int(right) + 2)
        rx0, ry0, rw, rh = _expand_crop_asymmetric(
            rx, my, max(1, int(right) + 2), h,
            vh, vw, pad_left=in_pad, pad_right=out_pad, pad_top=out_pad // 2, pad_bottom=out_pad // 2,
        )
        crops.append({
            "label": "Right border",
            "image": encode_crop(viz[ry0:ry0 + rh, rx0:rx0 + rw]),
            "location": {"x": rx0 / vw, "y": ry0 / vh, "width": rw / vw, "height": rh / vh},
        })

        # Top border crop
        tx0, ty0, tw, th = _expand_crop_asymmetric(
            mx, my, w, max(1, int(top) + 2),
            vh, vw, pad_left=out_pad // 2, pad_right=out_pad // 2, pad_top=out_pad, pad_bottom=in_pad,
        )
        crops.append({
            "label": "Top border",
            "image": encode_crop(viz[ty0:ty0 + th, tx0:tx0 + tw]),
            "location": {"x": tx0 / vw, "y": ty0 / vh, "width": tw / vw, "height": th / vh},
        })

        # Bottom border crop
        by = my + h - max(1, int(bottom) + 2)
        bx0, by0, bw, bh = _expand_crop_asymmetric(
            mx, by, w, max(1, int(bottom) + 2),
            vh, vw, pad_left=out_pad // 2, pad_right=out_pad // 2, pad_top=in_pad, pad_bottom=out_pad,
        )
        crops.append({
            "label": "Bottom border",
            "image": encode_crop(viz[by0:by0 + bh, bx0:bx0 + bw]),
            "location": {"x": bx0 / vw, "y": by0 / vh, "width": bw / vw, "height": bh / vh},
        })

        proof_image = generate_centering_proof(
            viz, lr_pct, tb_pct, left, right, top, bottom,
            mx=mx, my=my, card_w=w, card_h=h,
        )
        crops.insert(0, {
            "label": "Centering proof",
            "image": proof_image,
            "location": {"x": 0, "y": 0, "width": 1.0, "height": 1.0},
        })

    return CategoryResult(
        score=centering_subgrade,
        details=details,
        defects=defects,
        deviations={
            "leftRight": round(lr_pct, 1),
            "topBottom": round(tb_pct, 1),
            "centeringSubgrade": centering_subgrade,
        },
        crops=crops,
    )


def analyze_corners(
    card: np.ndarray,
    annotate: bool = True,
    display: np.ndarray | None = None,
    meta: dict[str, int] | None = None,
) -> CategoryResult:
    """Corner condition via wear, whitening, and chips — not sharpness alone."""
    gray = cv2.cvtColor(card, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    # PSA-style: ~12-15% of card side for corner ROIs
    cw, ch = max(20, int(w * 0.14)), max(20, int(h * 0.14))

    corner_positions = [
        ("top-left", 0, 0, cw, ch),
        ("top-right", w - cw, 0, cw, ch),
        ("bottom-left", 0, h - ch, cw, ch),
        ("bottom-right", w - cw, h - ch, cw, ch),
    ]

    defects: list[str] = []
    corner_scores: list[float] = []
    corner_details: list[dict[str, Any]] = []

    for name, x, y, rw, rh in corner_positions:
        roi = gray[y : y + rh, x : x + rw]
        roi_bgr = card[y : y + rh, x : x + rw]
        if roi.size == 0:
            corner_scores.append(4.0)
            corner_details.append({"name": name, "fray": 4.0, "fill": 4.0, "angle": 4.0})
            continue

        gx = cv2.Sobel(roi, cv2.CV_64F, 1, 0, ksize=3)
        gy = cv2.Sobel(roi, cv2.CV_64F, 0, 1, ksize=3)
        mag = np.sqrt(gx ** 2 + gy ** 2)
        lap_var = float(cv2.Laplacian(roi, cv2.CV_64F).var())

        edges = cv2.Canny(roi, 50, 150)
        edge_density = edges.mean() / 255.0

        sharpness = min(lap_var / 80.0, 1.0)
        gradient_strength = min(float(mag.mean()) / 40.0, 1.0)
        local = 0.55 * sharpness + 0.45 * gradient_strength

        white_frac, _ = _detect_whitening(roi_bgr)

        # PSA-style: start at 10.0, deduct for defects
        cscore = 10.0

        # Soft / rounded corners (low gradient)
        if local < 0.35:
            defects.append(f"Soft/rounded {name} corner")
            cscore -= 2.0
        elif local < 0.5:
            defects.append(f"Slight wear on {name} corner")
            cscore -= 0.8

        # Whitening / pulp exposure — common on played cards; damage often looks "sharp"
        if white_frac > 0.22:
            defects.append(f"Heavy whitening on {name} corner")
            cscore -= 4.5
        elif white_frac > 0.12:
            defects.append(f"Whitening on {name} corner")
            cscore -= 2.5
        elif white_frac > 0.05:
            defects.append(f"Light whitening on {name} corner")
            cscore -= 1.0

        # Chips / tears: busy irregular edge + whitening or extreme edge density
        if edge_density > 0.45 and white_frac > 0.08:
            defects.append(f"Chipped / damaged {name} corner")
            cscore -= 3.5
        elif edge_density > 0.40:
            defects.append(f"Possible fraying at {name} corner")
            cscore -= 1.5

        # PSA-style sub-scores (1-10 scale) — whitening lowers fill
        fray_score = round(min(10.0, 7.0 + 3.0 * (1.0 - min(edge_density * 2, 1.0))), 1)
        fill_score = round(min(10.0, 10.0 - white_frac * 40.0), 1)
        angle_score = round(min(10.0, 4.0 + 6.0 * min(gradient_strength, 1.0)), 1)
        if white_frac > 0.08:
            angle_score = round(min(angle_score, 6.0), 1)

        corner_scores.append(round(np.clip(cscore, 1.0, 10.0), 1))
        corner_details.append({
            "name": name,
            "fray": fray_score,
            "fill": fill_score,
            "angle": angle_score,
            "whitening": round(white_frac, 4),
            "x": x / w,
            "y": y / h,
            "width": rw / w,
            "height": rh / h,
        })

    avg = float(np.mean(corner_scores)) if corner_scores else 4.0
    worst = min(corner_scores) if corner_scores else 4.0
    # Worst corner dominates more (PSA-like)
    score = round(avg * 0.35 + worst * 0.65, 1)

    details = (
        f"Corner condition avg {avg:.1f}/10 (worst {worst:.1f}). "
        f"{'Crisp corners.' if score >= 9.0 else 'Light corner wear.' if score >= 7.0 else 'Visible corner wear.' if score >= 4.0 else 'Heavy corner damage.'}"
    )

    crops: list[dict[str, Any]] = []
    if annotate:
        viz = display if display is not None else card
        vh, vw = viz.shape[:2]
        mx = (meta or {}).get("mx", 0)
        my = (meta or {}).get("my", 0)
        # PSA-style: larger corner crops (~12% of side)
        out_pad = max(28, int(min(h, w) * 0.12))
        in_pad = max(cw, ch)

        for name, x, y, rw, rh in corner_positions:
            tip_x = mx if "left" in name else mx + w
            tip_y = my if "top" in name else my + h
            half = max(out_pad + in_pad // 2, int(min(h, w) * 0.16))

            pad_l = out_pad if "left" in name else in_pad
            pad_r = out_pad if "right" in name else in_pad
            pad_t = out_pad if "top" in name else in_pad
            pad_b = out_pad if "bottom" in name else in_pad

            core = max(16, half // 2)
            ex, ey, ew, eh = _expand_crop_asymmetric(
                tip_x - core // 2,
                tip_y - core // 2,
                core,
                core,
                vh, vw,
                pad_left=pad_l, pad_right=pad_r, pad_top=pad_t, pad_bottom=pad_b,
            )

            crop_bgr = viz[ey : ey + eh, ex : ex + ew]
            if crop_bgr.size == 0:
                continue

            cx_ratio = (tip_x - ex) / ew if ew > 0 else 0.5
            cy_ratio = (tip_y - ey) / eh if eh > 0 else 0.5
            annotated = annotate_crosshair(crop_bgr, cx_ratio, cy_ratio, length=max(12, half // 5))

            edge_x = tip_x - ex
            edge_y = tip_y - ey
            if 0 <= edge_x < ew:
                cv2.line(annotated, (edge_x, 0), (edge_x, eh), (255, 0, 255), 1, cv2.LINE_AA)
            if 0 <= edge_y < eh:
                cv2.line(annotated, (0, edge_y), (ew, edge_y), (255, 0, 255), 1, cv2.LINE_AA)

            corner_defects = [d for d in defects if name.replace("-", " ") in d.lower() or name in d.lower()]
            crops.append({
                "label": name.replace("-", " ").title(),
                "image": encode_crop(annotated),
                "location": {"x": ex / vw, "y": ey / vh, "width": ew / vw, "height": eh / vh},
            })
            if corner_defects:
                highlight = generate_defect_highlight(
                    viz,
                    {"x": ex / vw, "y": ey / vh, "width": ew / vw, "height": eh / vh},
                    "corners",
                    corner_defects[0][:30],
                )
                if highlight:
                    crops.append({
                        "label": f"{name.replace('-', ' ').title()} defect",
                        "image": highlight,
                        "location": {"x": ex / vw, "y": ey / vh, "width": ew / vw, "height": eh / vh},
                    })

    result = CategoryResult(score=score, details=details, defects=defects, crops=crops)
    result.deviations = {"cornerDetails": corner_details}
    return result


def _detect_whitening(edge_strip_bgr: np.ndarray) -> tuple[float, np.ndarray]:
    """
    Detect whitening on an edge/corner strip using Lab analysis.

    Handles dark borders (classic blue back) and light borders (yellow Base Set)
    by combining absolute near-white pulp, relative luminance spikes, and
    chroma loss vs the strip median.
    """
    if edge_strip_bgr.size == 0 or edge_strip_bgr.shape[0] < 3 or edge_strip_bgr.shape[1] < 3:
        return 0.0, np.zeros((1, 1), dtype=np.uint8)

    lab = cv2.cvtColor(edge_strip_bgr, cv2.COLOR_BGR2LAB)
    L = lab[:, :, 0].astype(np.float32)
    a_ch = lab[:, :, 1].astype(np.float32)
    b_ch = lab[:, :, 2].astype(np.float32)
    chroma = np.sqrt((a_ch - 128.0) ** 2 + (b_ch - 128.0) ** 2)

    L_median = float(np.median(L))
    L_std = float(np.std(L)) + 1e-6
    chroma_median = float(np.median(chroma))

    # Absolute pulp white (works on any border color)
    absolute_white = (L > 210) & (chroma < 24)

    # Relative: lighter than typical border pixels
    relative_white = (L > L_median + 1.2 * L_std) & (L > 165) & (chroma < 35)

    # Color loss on light/colored borders (yellow → white pulp)
    desat_white = (
        (L > max(175.0, L_median * 0.90))
        & (chroma < max(15.0, chroma_median * 0.40))
        & (chroma < 35)
    )

    white_mask = absolute_white | relative_white | desat_white
    frac = float(white_mask.mean())

    return frac, white_mask.astype(np.uint8) * 255


def analyze_edges(
    card: np.ndarray,
    annotate: bool = True,
    display: np.ndarray | None = None,
    meta: dict[str, int] | None = None,
) -> CategoryResult:
    """Edge consistency via Canny + Hough; dedicated whitening detector per edge."""
    gray = cv2.cvtColor(card, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    # PSA-style: analysis strip ~2-4% of short side
    strip_w = max(8, int(min(h, w) * 0.05))

    # Whitening strip: slightly wider for detection
    white_strip = max(10, int(min(h, w) * 0.06))

    edges = cv2.Canny(gray, 40, 120)
    defects: list[str] = []

    strips = {
        "left": (0, 0, strip_w, h),
        "right": (w - strip_w, 0, strip_w, h),
        "top": (0, 0, w, strip_w),
        "bottom": (0, h - strip_w, w, strip_w),
    }

    white_strips = {
        "left": card[:, :white_strip, :],
        "right": card[:, -white_strip:, :],
        "top": card[:white_strip, :, :],
        "bottom": card[-white_strip:, :, :],
    }

    strip_scores: list[float] = []
    edge_details: list[dict[str, Any]] = []

    for name, (x, y, rw, rh) in strips.items():
        s = edges[y : y + rh, x : x + rw]
        density = s.mean() / 255.0
        profile = s.mean(axis=0) if name in ("top", "bottom") else s.mean(axis=1)
        variance = float(np.var(profile)) if profile.size > 2 else 0.0

        # Whitening detection
        white_frac, white_mask = _detect_whitening(white_strips[name])

        continuity = 1.0 - min(variance / 2000.0, 1.0)

        # PSA-style: start at 10.0, deduct
        escore = 10.0

        if variance > 1500:
            defects.append(f"Uneven / chipped {name} edge")
            escore -= 2.5
        elif variance > 800:
            defects.append(f"Minor roughness on {name} edge")
            escore -= 1.0

        if white_frac > 0.25:
            defects.append(f"Heavy whitening on {name} edge ({white_frac * 100:.0f}%)")
            escore -= 4.5
        elif white_frac > 0.15:
            defects.append(f"Whitening on {name} edge ({white_frac * 100:.0f}%)")
            escore -= 3.0
        elif white_frac > 0.06:
            defects.append(f"Light whitening on {name} edge")
            escore -= 1.5

        # Also flag high Canny density as possible whitening
        if density > 0.35 and white_frac < 0.03:
            defects.append(f"Possible whitening/lifting on {name} edge")
            escore -= 1.2

        edge_integrity = round(min(10.0, 4.0 + 6.0 * continuity), 1)
        strip_scores.append(round(np.clip(escore, 1.0, 10.0), 1))
        edge_details.append({
            "name": name,
            "integrity": edge_integrity,
            "whitening": round(white_frac, 4),
            "x": x / w,
            "y": y / h,
            "width": rw / w,
            "height": rh / h,
        })

    lines = cv2.HoughLinesP(
        edges, 1, np.pi / 180, threshold=80, minLineLength=min(h, w) // 3, maxLineGap=10
    )
    warp_penalty = 0.0
    if lines is not None and len(lines) > 0:
        angles = []
        for line in lines[:40]:
            pts = np.asarray(line).reshape(-1)
            if pts.size < 4:
                continue
            x1, y1, x2, y2 = map(float, pts[:4])
            ang = abs(np.degrees(np.arctan2(y2 - y1, x2 - x1))) % 90
            angles.append(min(ang, 90 - ang))
        mean_dev = float(np.mean(angles)) if angles else 0
        if mean_dev > 4:
            defects.append("Possible card warp / edge skew")
            warp_penalty = min(2.0, mean_dev * 0.2)

    avg = float(np.mean(strip_scores)) if strip_scores else 4.0
    worst = min(strip_scores) if strip_scores else 4.0
    # Worst edge weighs more; heavy multi-edge whitening collapses the grade
    score = round(avg * 0.4 + worst * 0.6 - warp_penalty, 1)
    heavy_white_edges = sum(1 for d in edge_details if d.get("whitening", 0) > 0.10)
    if heavy_white_edges >= 3:
        score = min(score, 3.0)
        defects.append("Heavy whitening on multiple edges")
    elif heavy_white_edges >= 2:
        score = min(score, 5.0)
    score = round(float(np.clip(score, 1.0, 10.0)), 1)

    details = (
        f"Edge continuity avg {avg:.1f}/10 (worst {worst:.1f}). "
        f"{'Clean edges.' if score >= 9.0 else 'Light edge wear.' if score >= 7.0 else 'Visible edge issues.' if score >= 4.0 else 'Severe edge damage.'}"
    )

    crops: list[dict[str, Any]] = []
    if annotate:
        viz = display if display is not None else card
        vh, vw = viz.shape[:2]
        mx = (meta or {}).get("mx", 0)
        my = (meta or {}).get("my", 0)

        # PSA-style: wider edge strips (~12-15% of card side)
        out_pad = max(28, int(min(h, w) * 0.12))
        in_pad = max(48, int(min(h, w) * 0.16))
        span = min(max(h, w), max(160, int(min(h, w) * 0.55)))

        # Background model from the full display (for guide snapping in-crop)
        dist_full = _lab_distance_to_background(viz)
        sh, sw = max(4, vh // 12), max(4, vw // 12)
        corner_d = np.concatenate([
            dist_full[0:sh, 0:sw].ravel(),
            dist_full[0:sh, vw - sw : vw].ravel(),
            dist_full[vh - sh : vh, 0:sw].ravel(),
            dist_full[vh - sh : vh, vw - sw : vw].ravel(),
        ])
        bg_thresh = max(14.0, float(np.percentile(corner_d, 90)) * 1.5 + 8.0)

        def _snap_guide_in_crop(crop_dist: np.ndarray, side: str, fallback: int) -> int:
            """Find card/background transition inside an edge crop."""
            ch_, cw_ = crop_dist.shape
            if side in ("left", "right"):
                # Mean distance per column
                prof = crop_dist[int(ch_ * 0.15):int(ch_ * 0.85), :].mean(axis=0)
                if prof.size < 4:
                    return fallback
                # Prefer transition near the expected edge
                diff = np.abs(np.diff(prof, prepend=prof[0]))
                # Side facing outward should be more background-like
                scores = diff.copy()
                for i in range(1, len(prof) - 1):
                    if side == "left":
                        # outside = smaller x
                        outside = float(np.mean(prof[max(0, i - 3):i + 1]))
                        inside = float(np.mean(prof[i:min(len(prof), i + 4)]))
                    else:
                        outside = float(np.mean(prof[i:min(len(prof), i + 4)]))
                        inside = float(np.mean(prof[max(0, i - 3):i + 1]))
                    if outside < bg_thresh * 1.2 and inside > bg_thresh * 0.8:
                        scores[i] *= 3.0
                    else:
                        scores[i] *= 0.25
                return int(np.clip(int(np.argmax(scores)), 1, cw_ - 2))
            prof = crop_dist[:, int(cw_ * 0.15):int(cw_ * 0.85)].mean(axis=1)
            if prof.size < 4:
                return fallback
            diff = np.abs(np.diff(prof, prepend=prof[0]))
            scores = diff.copy()
            for i in range(1, len(prof) - 1):
                if side == "top":
                    outside = float(np.mean(prof[max(0, i - 3):i + 1]))
                    inside = float(np.mean(prof[i:min(len(prof), i + 4)]))
                else:
                    outside = float(np.mean(prof[i:min(len(prof), i + 4)]))
                    inside = float(np.mean(prof[max(0, i - 3):i + 1]))
                if outside < bg_thresh * 1.2 and inside > bg_thresh * 0.8:
                    scores[i] *= 3.0
                else:
                    scores[i] *= 0.25
            return int(np.clip(int(np.argmax(scores)), 1, ch_ - 2))

        edge_viewports = {
            "left": (
                mx - out_pad,
                my + max(0, (h - span) // 2),
                out_pad + in_pad,
                span,
            ),
            "right": (
                mx + w - in_pad,
                my + max(0, (h - span) // 2),
                out_pad + in_pad,
                span,
            ),
            "top": (
                mx + max(0, (w - span) // 2),
                my - out_pad,
                span,
                out_pad + in_pad,
            ),
            "bottom": (
                mx + max(0, (w - span) // 2),
                my + h - in_pad,
                span,
                out_pad + in_pad,
            ),
        }

        for name, (vx, vy, vw_box, vh_box) in edge_viewports.items():
            preferred = (
                max(0, min(vw - 1, vx)),
                max(0, min(vh - 1, vy)),
            )
            pref_w = min(vw - preferred[0], max(vw_box, out_pad + in_pad))
            pref_h = min(vh - preferred[1], max(vh_box, out_pad + in_pad))
            if pref_w < 24 or pref_h < 24:
                continue
            ex, ey, ew, eh = preferred[0], preferred[1], pref_w, pref_h

            crop_bgr = viz[ey : ey + eh, ex : ex + ew].copy()
            if crop_bgr.size == 0:
                continue

            # Annotate whitening pixels on the crop
            white_crop = _detect_whitening(crop_bgr)[1]
            if white_crop.shape == crop_bgr.shape[:2]:
                white_3c = cv2.cvtColor(white_crop, cv2.COLOR_GRAY2BGR)
                tint = np.zeros_like(crop_bgr, dtype=np.uint8)
                tint[:, :] = (255, 0, 255)
                mask_bool = white_3c > 0
                crop_bgr = np.where(mask_bool, cv2.addWeighted(crop_bgr, 0.6, tint, 0.4, 0), crop_bgr)

            ch_img, cw_img = crop_bgr.shape[:2]
            crop_dist = dist_full[ey : ey + eh, ex : ex + ew]
            # Magenta stands out on yellow Pokémon borders and dark tables alike
            guide = (255, 0, 255)
            outline = (255, 255, 255)

            # Meta-based fallback, then snap to real bg→card transition in-crop
            if name == "left":
                fallback = int(np.clip(mx - ex, 1, cw_img - 2))
                gx = _snap_guide_in_crop(crop_dist, "left", fallback)
                cv2.line(crop_bgr, (gx, 0), (gx, ch_img), outline, 3, cv2.LINE_AA)
                cv2.line(crop_bgr, (gx, 0), (gx, ch_img), guide, 1, cv2.LINE_AA)
            elif name == "right":
                fallback = int(np.clip(mx + w - ex, 1, cw_img - 2))
                gx = _snap_guide_in_crop(crop_dist, "right", fallback)
                cv2.line(crop_bgr, (gx, 0), (gx, ch_img), outline, 3, cv2.LINE_AA)
                cv2.line(crop_bgr, (gx, 0), (gx, ch_img), guide, 1, cv2.LINE_AA)
            elif name == "top":
                fallback = int(np.clip(my - ey, 1, ch_img - 2))
                gy = _snap_guide_in_crop(crop_dist, "top", fallback)
                cv2.line(crop_bgr, (0, gy), (cw_img, gy), outline, 3, cv2.LINE_AA)
                cv2.line(crop_bgr, (0, gy), (cw_img, gy), guide, 1, cv2.LINE_AA)
            else:
                fallback = int(np.clip(my + h - ey, 1, ch_img - 2))
                gy = _snap_guide_in_crop(crop_dist, "bottom", fallback)
                cv2.line(crop_bgr, (0, gy), (cw_img, gy), outline, 3, cv2.LINE_AA)
                cv2.line(crop_bgr, (0, gy), (cw_img, gy), guide, 1, cv2.LINE_AA)

            crops.append({
                "label": f"{name.title()} edge",
                "image": encode_crop(crop_bgr),
                "location": {"x": ex / vw, "y": ey / vh, "width": ew / vw, "height": eh / vh},
            })

            edge_defects = [d for d in defects if name in d.lower()]
            if edge_defects:
                highlight = generate_defect_highlight(
                    viz,
                    {"x": ex / vw, "y": ey / vh, "width": ew / vw, "height": eh / vh},
                    "edges",
                    edge_defects[0][:30],
                )
                if highlight:
                    crops.append({
                        "label": f"{name.title()} edge defect",
                        "image": highlight,
                        "location": {"x": ex / vw, "y": ey / vh, "width": ew / vw, "height": eh / vh},
                    })

    result = CategoryResult(score=score, details=details, defects=defects, crops=crops)
    result.deviations = {"edgeDetails": edge_details}
    return result


def analyze_surface(card: np.ndarray, annotate: bool = True) -> CategoryResult:
    """Surface defects via variance, scratches, print lines, and crease/tear detection."""
    gray = cv2.cvtColor(card, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    m = max(4, min(h, w) // 20)
    inner = gray[m : h - m, m : w - m]
    if inner.size < 100:
        inner = gray

    defects: list[str] = []

    blur = cv2.GaussianBlur(inner, (5, 5), 0)
    local_var = cv2.blur((inner.astype(np.float32) - blur.astype(np.float32)) ** 2, (9, 9))
    var_mean = float(local_var.mean())
    var_std = float(local_var.std()) + 1e-6
    # Detect holographic/foil surface: high L-channel std + high mean variance
    lab_full = cv2.cvtColor(card, cv2.COLOR_BGR2LAB)
    holo_indicator = float(np.std(lab_full[:, :, 0].astype(np.float32)))
    is_holo = holo_indicator > 45 and var_mean > 150
    hotspots = (local_var > (var_mean + 3.0 * var_std)).astype(np.uint8) * 255
    hotspot_ratio = hotspots.mean() / 255.0

    scratch_score = 0.0
    for ksize in (15, 25):
        h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (ksize, 1))
        v_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, ksize))
        surf_edges = cv2.Canny(inner, 60, 160)
        h_lines = cv2.morphologyEx(surf_edges, cv2.MORPH_OPEN, h_kernel)
        v_lines = cv2.morphologyEx(surf_edges, cv2.MORPH_OPEN, v_kernel)
        scratch_score = max(scratch_score, h_lines.mean() / 255.0, v_lines.mean() / 255.0)

    sobel_y = cv2.Sobel(inner, cv2.CV_64F, 0, 1, ksize=3)
    horiz_energy = float(np.abs(sobel_y).mean())

    structural = _detect_structural_damage(card)

    # PSA-style: start at 10.0, deduct for each defect
    score = 10.0

    hotspot_threshold = 0.15 if is_holo else 0.08
    light_hotspot_threshold = 0.08 if is_holo else 0.04
    if hotspot_ratio > hotspot_threshold:
        defects.append("Surface scratches or scuffs detected")
        score -= 2.0
    elif hotspot_ratio > light_hotspot_threshold:
        defects.append("Light surface wear")
        score -= 0.8

    if scratch_score > 0.06:
        defects.append("Linear scratch marks")
        score -= 1.5
    elif scratch_score > 0.03:
        defects.append("Faint scratch traces")
        score -= 0.5

    if horiz_energy > 18 and scratch_score > 0.02:
        defects.append("Possible print lines on surface")
        score -= 1.0
    elif horiz_energy > 25:
        defects.append("Surface texture irregularity (print)")
        score -= 0.5

    bgr_inner = card[m : h - m, m : w - m] if card.shape[0] > 2 * m else card
    lab = cv2.cvtColor(bgr_inner, cv2.COLOR_BGR2LAB)
    l_std = float(lab[:, :, 0].std())
    if l_std > 65 and hotspot_ratio > 0.025:
        defects.append("Possible surface clouding / denting")
        score -= 1.2

    # Creases / folds / tears — hard caps (these dominate PSA surface grades)
    if structural["possible_tear"]:
        defects.append("Possible tear or severe edge-reaching crease")
        score = min(score, 2.0)
    elif structural["major_crease"]:
        n = structural["crease_count"]
        defects.append(
            f"Major crease/fold damage detected ({n} line{'s' if n != 1 else ''})"
        )
        score = min(score, 3.5)
    elif structural["crease_count"] >= 1:
        defects.append("Crease or fold line detected")
        score = min(score - 2.0, 5.0)
        score -= structural["severity"] * 1.0

    score = round(np.clip(score, 1.0, 10.0), 1)

    details = (
        f"Surface uniformity {score}/10 "
        f"(hotspot {hotspot_ratio * 100:.1f}%, scratch index {scratch_score:.3f}"
        f"{', crease severity ' + str(structural['severity']) if structural['crease_count'] else ''}). "
        f"{'Clean surface.' if score >= 9.0 else 'Minor surface marks.' if score >= 7.0 else 'Visible surface defects.' if score >= 4.0 else 'Severe surface damage.'}"
    )

    crops: list[dict[str, Any]] = []
    if annotate:
        heatmap_norm = np.clip((local_var - var_mean) / (3 * var_std), 0, 1)
        heatmap_u8 = (heatmap_norm * 255).astype(np.uint8)
        heatmap_color = cv2.applyColorMap(heatmap_u8, cv2.COLORMAP_JET)
        inner_bgr = card[m : h - m, m : w - m] if card.shape[0] > 2 * m else card
        if heatmap_color.shape == inner_bgr.shape:
            overlay = cv2.addWeighted(inner_bgr, 0.55, heatmap_color, 0.45, 0)
        else:
            overlay = inner_bgr
        crops.append({
            "label": "Surface heatmap (red = defect zones)",
            "image": encode_crop(overlay),
            "location": {"x": m / w, "y": m / h, "width": (w - 2 * m) / w, "height": (h - 2 * m) / h},
        })

        line_mask = structural.get("line_mask")
        if line_mask is not None and line_mask.any():
            crease_viz = card.copy()
            crease_viz[line_mask > 0] = (0, 0, 255)
            crease_viz = cv2.addWeighted(card, 0.55, crease_viz, 0.45, 0)
            crops.append({
                "label": "Detected crease / fold lines",
                "image": encode_crop(crease_viz),
                "location": {"x": 0, "y": 0, "width": 1, "height": 1},
            })

        crops.append({
            "label": "Full card surface",
            "image": encode_crop(inner_bgr),
            "location": {"x": m / w, "y": m / h, "width": (w - 2 * m) / w, "height": (h - 2 * m) / h},
        })
        if defects:
            hotspot_coords = np.where(local_var > var_mean + 2.0 * var_std)
            if len(hotspot_coords[0]) > 0:
                defect_labels = ["Scratch/scuff", "Surface wear", "Print line", "Clouding", "Crease"]
                for i, defect in enumerate(defects[:3]):
                    label = "Crease" if "crease" in defect.lower() or "tear" in defect.lower() else defect_labels[i % len(defect_labels)]
                    region_idx = i % len(hotspot_coords[0])
                    hy = int(hotspot_coords[0][region_idx]) + m
                    hx = int(hotspot_coords[1][region_idx]) + m
                    crop_size = max(20, min(60, min(h, w) // 8))
                    cy1 = max(0, hy - crop_size)
                    cy2 = min(h, hy + crop_size)
                    cx1 = max(0, hx - crop_size)
                    cx2 = min(w, hx + crop_size)
                    highlight = generate_defect_highlight(
                        card,
                        {"x": cx1 / w, "y": cy1 / h, "width": (cx2 - cx1) / w, "height": (cy2 - cy1) / h},
                        "surface",
                        label,
                    )
                    if highlight:
                        crops.append({
                            "label": f"Defect: {label}",
                            "image": highlight,
                            "location": {"x": cx1 / w, "y": cy1 / h, "width": (cx2 - cx1) / w, "height": (cy2 - cy1) / h},
                        })

    result = CategoryResult(score=score, details=details, defects=defects, crops=crops)
    result.deviations = {
        "structural": {
            "severity": structural["severity"],
            "creaseCount": structural["crease_count"],
            "majorCrease": structural["major_crease"],
            "possibleTear": structural["possible_tear"],
        }
    }
    return result


# ── Single-side grading pipeline ─────────────────────────────────────────────

def grade_side(
    bgr: np.ndarray,
    annotate: bool = True,
    is_front: bool = True,
    extraction: Any | None = None,
) -> dict[str, Any]:
    """
    Grade one side (front or back) of a card.

    Uses extraction warp + geometric centering v2 + ONNX/heuristic specialists.
    Falls back to legacy prepare_card_view when extraction is unavailable.
    """
    from centering_v2 import analyze_centering_v2
    from model_inference import predict_axis

    ext_meta: dict[str, Any] = {}
    if extraction is not None and getattr(extraction, "found", False):
        card = extraction.card_bgr
        display = extraction.display_bgr
        found = True
        meta = dict(extraction.meta or {})
        meta["extractionConfidence"] = extraction.confidence
        meta["extractionMethod"] = extraction.method
        ext_meta = extraction.to_debug_dict() if hasattr(extraction, "to_debug_dict") else {}
    else:
        display, card, found, meta = prepare_card_view(bgr, context_margin=0.08)

    # Centering: geometric v2 on warped card
    c_info = analyze_centering_v2(card, is_front=is_front)
    centering = analyze_centering(card, annotate, display=display, meta=meta, is_front=is_front)
    centering.score = float(c_info["score"])
    centering.details = c_info["details"]
    centering.defects = list(c_info.get("defects") or [])
    centering.deviations = {
        **(centering.deviations or {}),
        **(c_info.get("deviations") or {}),
    }

    # Corners / edges / surface: ONNX specialists with heuristic fallback,
    # still using legacy analyzers for crops / evidence imagery.
    corners = analyze_corners(card, annotate, display=display, meta=meta)
    edges = analyze_edges(card, annotate, display=display, meta=meta)
    surface = analyze_surface(card, annotate)

    corner_pred = predict_axis("corners", card)
    edge_pred = predict_axis("edges", card)
    surface_pred = predict_axis("surface", card)

    heuristic_corners_score = corners.score
    onnx_corners_score = float(corner_pred["score"])
    onnx_corners_conf = float(corner_pred.get("confidence", 0.5))
    corners.score = round(heuristic_corners_score * (1.0 - onnx_corners_conf) + onnx_corners_score * onnx_corners_conf, 1)
    corners.defects = list(dict.fromkeys([*(corners.defects or []), *(corner_pred.get("defects") or [])]))
    if corner_pred.get("source") == "onnx":
        corners.details = f"Corners specialist model · {corners.score}/10. {corners.details}"
    corners.deviations = {
        **(corners.deviations or {}),
        "confidence": corner_pred.get("confidence"),
        "source": corner_pred.get("source"),
        "heuristicScore": heuristic_corners_score,
        "onnxScore": onnx_corners_score,
    }

    heuristic_edges_score = edges.score
    onnx_edges_score = float(edge_pred["score"])
    onnx_edges_conf = float(edge_pred.get("confidence", 0.5))
    edges.score = round(heuristic_edges_score * (1.0 - onnx_edges_conf) + onnx_edges_score * onnx_edges_conf, 1)
    edges.defects = list(dict.fromkeys([*(edges.defects or []), *(edge_pred.get("defects") or [])]))
    if edge_pred.get("source") == "onnx":
        edges.details = f"Edges specialist model · {edges.score}/10. {edges.details}"
    edges.deviations = {
        **(edges.deviations or {}),
        "confidence": edge_pred.get("confidence"),
        "source": edge_pred.get("source"),
        "heuristicScore": heuristic_edges_score,
        "onnxScore": onnx_edges_score,
    }

    heuristic_surface_score = surface.score
    onnx_surface_score = float(surface_pred["score"])
    onnx_surface_conf = float(surface_pred.get("confidence", 0.5))
    surface.score = round(heuristic_surface_score * (1.0 - onnx_surface_conf) + onnx_surface_score * onnx_surface_conf, 1)
    surface.defects = list(dict.fromkeys([*(surface.defects or []), *(surface_pred.get("defects") or [])]))
    if surface_pred.get("source") == "onnx":
        surface.details = f"Surface specialist model · {surface.score}/10. {surface.details}"
    # Preserve structural damage from classical detector
    structural = (surface.deviations or {}).get("structural") or {}
    surface.deviations = {
        **(surface.deviations or {}),
        "confidence": surface_pred.get("confidence"),
        "source": surface_pred.get("source"),
        "structural": structural,
    }

    if not found:
        for cat in (centering, corners, edges, surface):
            cat.score = round(max(1.0, cat.score * 0.92), 1)
        centering.defects.append("Card boundary uncertain — scores may be conservative")

    # PSA-like limiter: overall biased toward worst category (not soft average)
    scores = [centering.score, corners.score, edges.score, surface.score]
    avg = float(np.mean(scores))
    worst = min(scores)
    overall = round(avg * 0.35 + worst * 0.65, 1)

    # Structural hard-caps — only when classical detector and surface score agree
    # (avoids artwork/texture false positives crushing otherwise clean cards)
    if structural.get("possibleTear") and surface.score < 6.5:
        overall = min(overall, 2.0)
        surface.defects.append("Possible tear / edge-reaching crease")
    elif structural.get("majorCrease") and surface.score < 6.5:
        overall = min(overall, 3.5)
        if "Major crease" not in " ".join(surface.defects):
            surface.defects.append("Major crease detected")
    elif structural.get("creaseCount", 0) >= 3 and surface.score < 7.0:
        overall = min(overall, 5.0)

    # Half-point snap
    overall = round(overall * 2) / 2
    grade, label = score_to_grade(overall)

    axis_conf = [
        float(c_info.get("confidence") or 0.5),
        float(corner_pred.get("confidence") or 0.5),
        float(edge_pred.get("confidence") or 0.5),
        float(surface_pred.get("confidence") or 0.5),
    ]
    side_confidence = float(np.mean(axis_conf))
    if c_info.get("lowConfidence"):
        side_confidence = min(side_confidence, 0.45)
    if not found:
        side_confidence = min(side_confidence, 0.4)

    return {
        "centering": centering,
        "corners": corners,
        "edges": edges,
        "surface": surface,
        "totalScore": round(overall * 100, 1),
        "grade": grade,
        "gradeLabel": label,
        "display": display,
        "meta": meta,
        "confidence": round(side_confidence, 3),
        "extraction": ext_meta,
        "cardImage": card,
    }


# ── Public API ────────────────────────────────────────────────────────────────

def grade_card_image(
    front_img: Image.Image,
    back_img: Image.Image | None = None,
    *,
    strict_extraction: bool = False,
) -> dict[str, Any]:
    """
    Full PSA-style grading pipeline. Accepts front (required) and back (optional) PIL Images.
    When both sides are provided, each category uses min(front, back) — worst side wins.
    totalScore = grade * 100.
    """
    from extraction import extract_card
    from model_inference import provider_info
    from quality_gate import assess_image_quality, quality_confidence_penalty

    front_quality = assess_image_quality(front_img)
    if not front_quality.ok:
        raise ValueError(f"{front_quality.code}:{front_quality.message}")

    front_bgr = pil_to_cv(front_img)
    max_side = 2400
    h, w = front_bgr.shape[:2]
    if max(h, w) > max_side:
        scale = max_side / max(h, w)
        front_bgr = cv2.resize(front_bgr, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)

    front_ext = extract_card(front_bgr, require_detection=strict_extraction)
    if strict_extraction and not front_ext.found:
        raise ValueError(f"{front_ext.code or 'card_not_detected'}:{front_ext.message or 'Card not detected'}")

    front_result = grade_side(front_bgr, annotate=True, is_front=True, extraction=front_ext)

    front_cats = {
        "centering": front_result["centering"],
        "corners": front_result["corners"],
        "edges": front_result["edges"],
        "surface": front_result["surface"],
    }

    q_pen = quality_confidence_penalty(front_quality.metrics)
    overall_confidence = float(front_result.get("confidence", 0.6)) * q_pen

    result: dict[str, Any] = {
        "id": f"grade-{uuid.uuid4().hex[:12]}",
        "totalScore": front_result["totalScore"],
        "grade": front_result["grade"],
        "gradeLabel": front_result["gradeLabel"],
        "suggestedCondition": grade_to_condition(front_result["grade"]),
        "front": {k: v.to_dict() for k, v in front_cats.items()},
        "confidence": round(overall_confidence, 3),
        "quality": front_quality.to_dict(),
        "extraction": front_result.get("extraction") or front_ext.to_debug_dict(),
        "provider": provider_info(),
        "retakeRecommended": overall_confidence < 0.5,
    }

    # Grade back if provided
    if back_img is not None:
        back_quality = assess_image_quality(back_img)
        if not back_quality.ok:
            raise ValueError(f"{back_quality.code}:{back_quality.message}")

        back_bgr = pil_to_cv(back_img)
        h, w = back_bgr.shape[:2]
        if max(h, w) > max_side:
            scale = max_side / max(h, w)
            back_bgr = cv2.resize(back_bgr, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)

        back_ext = extract_card(back_bgr, require_detection=strict_extraction)
        if strict_extraction and not back_ext.found:
            raise ValueError(f"{back_ext.code or 'card_not_detected'}:{back_ext.message or 'Back card not detected'}")

        back_result = grade_side(back_bgr, annotate=True, is_front=False, extraction=back_ext)
        back_cats = {
            "centering": back_result["centering"],
            "corners": back_result["corners"],
            "edges": back_result["edges"],
            "surface": back_result["surface"],
        }
        result["back"] = {k: v.to_dict() for k, v in back_cats.items()}
        result["backQuality"] = back_quality.to_dict()
        result["backExtraction"] = back_result.get("extraction") or back_ext.to_debug_dict()

        blended_scores = []
        combined_cats: dict[str, dict[str, Any]] = {}
        for cat_name in front_cats:
            front_score = front_cats[cat_name].score
            back_score = back_cats[cat_name].score
            worse = back_cats[cat_name] if back_score < front_score else front_cats[cat_name]
            worse_val = min(front_score, back_score)
            better_val = max(front_score, back_score)
            blended = round(worse_val * 0.7 + better_val * 0.3, 1)
            blended_scores.append(blended)
            combined = worse.to_dict()
            combined["score"] = blended
            if front_score != back_score:
                combined["details"] = (
                    f"{combined.get('details', '')} "
                    f"(front {front_score}/10, back {back_score}/10 — weighted blend)."
                ).strip()
            combined_cats[cat_name] = combined

        avg_blended = float(np.mean(blended_scores))
        worst_blended = min(blended_scores)
        overall = round(avg_blended * 0.35 + worst_blended * 0.65, 1)
        overall = min(overall, front_result["grade"], back_result["grade"])
        overall = max(1.0, min(10.0, round(overall * 2) / 2))
        result["grade"] = overall
        result["gradeLabel"] = score_to_grade(overall)[1]
        result["totalScore"] = round(overall * 100, 1)
        result["suggestedCondition"] = grade_to_condition(overall)

        back_pen = quality_confidence_penalty(back_quality.metrics)
        overall_confidence = min(
            overall_confidence,
            float(back_result.get("confidence", 0.6)) * back_pen,
        )
        result["confidence"] = round(overall_confidence, 3)
        result["retakeRecommended"] = overall_confidence < 0.5

        result["defectRegions"] = _build_defect_regions(front_result, back_result, front_bgr, back_bgr)

        result["centering"] = combined_cats["centering"]
        result["corners"] = combined_cats["corners"]
        result["edges"] = combined_cats["edges"]
        result["surface"] = combined_cats["surface"]
    else:
        result["defectRegions"] = _build_defect_regions(front_result, None, front_bgr, None)
        result["centering"] = result["front"]["centering"]
        result["corners"] = result["front"]["corners"]
        result["edges"] = result["front"]["edges"]
        result["surface"] = result["front"]["surface"]
        if back_img is None:
            result["limitations"] = "Back not provided — back defects not assessed."

    return result


def _build_defect_regions(
    front: dict[str, Any],
    back: dict[str, Any] | None,
    front_bgr: np.ndarray,
    back_bgr: np.ndarray | None,
) -> list[dict[str, Any]]:
    """Build the combined defect regions list from front + back analysis."""
    regions: list[dict[str, Any]] = []

    fh, fw = front_bgr.shape[:2]

    # Front corner crops (annotated)
    for corner in front["corners"].crops:
        regions.append({
            "category": "corners",
            "side": "front",
            "label": f"Front {corner['label']}",
            "severity": "minor",  # determined by score
            "cropImage": corner["image"],
            "location": corner["location"],
        })

    # Front edge crops
    for edge in front["edges"].crops:
        regions.append({
            "category": "edges",
            "side": "front",
            "label": f"Front {edge['label']}",
            "severity": "minor",
            "cropImage": edge["image"],
            "location": edge["location"],
        })

    # Front centering crops
    for crop in front["centering"].crops:
        regions.append({
            "category": "centering",
            "side": "front",
            "label": f"Front {crop['label']}",
            "severity": severity_from_score(front["centering"].score),
            "cropImage": crop["image"],
            "location": crop["location"],
        })

    # Front surface crops
    for crop in front["surface"].crops:
        regions.append({
            "category": "surface",
            "side": "front",
            "label": f"Front {crop['label']}",
            "severity": severity_from_score(front["surface"].score),
            "cropImage": crop["image"],
            "location": crop["location"],
        })

    # Back side (if provided)
    if back is not None and back_bgr is not None:
        for corner in back["corners"].crops:
            regions.append({
                "category": "corners",
                "side": "back",
                "label": f"Back {corner['label']}",
                "severity": "minor",
                "cropImage": corner["image"],
                "location": corner["location"],
            })

        for edge in back["edges"].crops:
            regions.append({
                "category": "edges",
                "side": "back",
                "label": f"Back {edge['label']}",
                "severity": "minor",
                "cropImage": edge["image"],
                "location": edge["location"],
            })

        for crop in back["centering"].crops:
            regions.append({
                "category": "centering",
                "side": "back",
                "label": f"Back {crop['label']}",
                "severity": severity_from_score(back["centering"].score),
                "cropImage": crop["image"],
                "location": crop["location"],
            })

        for crop in back["surface"].crops:
            regions.append({
                "category": "surface",
                "side": "back",
                "label": f"Back {crop['label']}",
                "severity": severity_from_score(back["surface"].score),
                "cropImage": crop["image"],
                "location": crop["location"],
            })

    return regions

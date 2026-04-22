"""
Card extraction: multi-candidate detection + perspective warp.

Replaces brittle "sample background from image corners" as the sole signal.
Uses Lab distance, Canny edges, GrabCut, and adaptive thresholding in parallel,
then picks the best card-like quadrilateral and warps to a canonical size.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

import cv2
import numpy as np
from PIL import Image


# Pokemon / standard TCG card ~ 63 × 88 mm
CARD_ASPECT = 63.0 / 88.0  # width / height ≈ 0.716
CANONICAL_H = 1400
CANONICAL_W = int(round(CANONICAL_H * CARD_ASPECT))  # ~1002


@dataclass
class ExtractionResult:
    found: bool
    card_bgr: np.ndarray  # warped canonical card (or best crop)
    display_bgr: np.ndarray  # original (or annotated) view
    corners: np.ndarray | None  # 4x2 float32 in source image coords
    tilt_deg: float = 0.0
    confidence: float = 0.0
    method: str = "none"
    overlay_b64: str | None = None
    code: str | None = None  # card_not_detected | tilted_too_much
    message: str | None = None
    meta: dict[str, Any] = field(default_factory=dict)

    def to_debug_dict(self) -> dict[str, Any]:
        return {
            "found": self.found,
            "method": self.method,
            "confidence": round(self.confidence, 3),
            "tiltDeg": round(self.tilt_deg, 2),
            "canonicalSize": [CANONICAL_W, CANONICAL_H],
            "overlay": self.overlay_b64,
            "code": self.code,
            "message": self.message,
        }


def pil_to_bgr(img: Image.Image) -> np.ndarray:
    return cv2.cvtColor(np.array(img.convert("RGB")), cv2.COLOR_RGB2BGR)


def bgr_to_pil(bgr: np.ndarray) -> Image.Image:
    return Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))


def _order_corners(pts: np.ndarray) -> np.ndarray:
    """Order points TL, TR, BR, BL."""
    pts = np.asarray(pts, dtype=np.float32).reshape(4, 2)
    s = pts.sum(axis=1)
    diff = np.diff(pts, axis=1).ravel()
    tl = pts[np.argmin(s)]
    br = pts[np.argmax(s)]
    tr = pts[np.argmin(diff)]
    bl = pts[np.argmax(diff)]
    return np.array([tl, tr, br, bl], dtype=np.float32)


def _tilt_from_corners(corners: np.ndarray) -> float:
    tl, tr, br, bl = corners
    top = math.degrees(math.atan2(tr[1] - tl[1], tr[0] - tl[0]))
    bot = math.degrees(math.atan2(br[1] - bl[1], br[0] - bl[0]))
    return abs((top + bot) / 2.0)


def _aspect_score(w: float, h: float) -> float:
    if h < 1 or w < 1:
        return 0.0
    ratio = w / h
    target = CARD_ASPECT
    # Also accept portrait flip (height/width)
    err = min(abs(ratio - target) / target, abs((h / w) - target) / target)
    return float(max(0.0, 1.0 - err * 2.5))


def _quad_from_contour(c: np.ndarray) -> np.ndarray | None:
    peri = cv2.arcLength(c, True)
    approx = cv2.approxPolyDP(c, 0.02 * peri, True)
    if len(approx) == 4:
        return _order_corners(approx.reshape(4, 2))
    rect = cv2.minAreaRect(c)
    box = cv2.boxPoints(rect)
    return _order_corners(box)


def _lab_fg_masks(bgr: np.ndarray) -> list[np.ndarray]:
    """Multiple foreground masks — not only corner-sampled background."""
    h, w = bgr.shape[:2]
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    masks: list[np.ndarray] = []

    # 1) Corner-sampled Lab distance (works on solid backgrounds)
    margin = max(4, min(h, w) // 14)
    corners = np.concatenate([
        lab[0:margin, 0:margin].reshape(-1, 3),
        lab[0:margin, w - margin : w].reshape(-1, 3),
        lab[h - margin : h, 0:margin].reshape(-1, 3),
        lab[h - margin : h, w - margin : w].reshape(-1, 3),
    ])
    bg = np.median(corners, axis=0)
    dist = np.linalg.norm(lab - bg, axis=2)
    floor = float(np.percentile(
        np.concatenate([
            dist[0:margin, 0:margin].ravel(),
            dist[0:margin, w - margin : w].ravel(),
            dist[h - margin : h, 0:margin].ravel(),
            dist[h - margin : h, w - margin : w].ravel(),
        ]),
        90,
    ))
    thr = max(16.0, floor * 2.2 + 6.0)
    m1 = (dist > thr).astype(np.uint8) * 255
    masks.append(m1)

    # 2) Adaptive threshold on grayscale (busy backgrounds)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    m2 = cv2.adaptiveThreshold(
        blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 35, 8
    )
    masks.append(m2)

    # 3) Otsu
    _, m3 = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    # Pick polarity that yields a card-sized blob in the center
    masks.append(m3)
    masks.append(cv2.bitwise_not(m3))

    # 4) Canny + close
    edges = cv2.Canny(blur, 40, 120)
    k = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
    m4 = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, k, iterations=3)
    masks.append(m4)

    cleaned: list[np.ndarray] = []
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9))
    for m in masks:
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, kernel, iterations=2)
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5)))
        cleaned.append(m)
    return cleaned


def _grabcut_quad(bgr: np.ndarray, seed_rect: tuple[int, int, int, int] | None = None) -> np.ndarray | None:
    h, w = bgr.shape[:2]
    if seed_rect is None:
        pad_x, pad_y = int(w * 0.08), int(h * 0.08)
        seed_rect = (pad_x, pad_y, w - 2 * pad_x, h - 2 * pad_y)
    x, y, bw, bh = seed_rect
    if bw < 40 or bh < 40:
        return None
    mask = np.zeros((h, w), np.uint8)
    bgd = np.zeros((1, 65), np.float64)
    fgd = np.zeros((1, 65), np.float64)
    try:
        cv2.grabCut(bgr, mask, (x, y, bw, bh), bgd, fgd, 3, cv2.GC_INIT_WITH_RECT)
    except cv2.error:
        return None
    binary = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None
    c = max(contours, key=cv2.contourArea)
    if cv2.contourArea(c) < h * w * 0.05:
        return None
    return _quad_from_contour(c)


def _score_candidate(
    corners: np.ndarray,
    img_area: float,
    img_w: int,
    img_h: int,
) -> float:
    tl, tr, br, bl = corners
    width = (np.linalg.norm(tr - tl) + np.linalg.norm(br - bl)) / 2.0
    height = (np.linalg.norm(bl - tl) + np.linalg.norm(br - tr)) / 2.0
    area = width * height
    area_ratio = area / max(img_area, 1.0)
    if area_ratio < 0.06 or area_ratio > 0.98:
        return 0.0

    aspect = _aspect_score(width, height)
    # Prefer quads near center
    cx = float(np.mean(corners[:, 0]))
    cy = float(np.mean(corners[:, 1]))
    center_dist = math.hypot(cx - img_w / 2, cy - img_h / 2) / math.hypot(img_w / 2, img_h / 2)
    center_score = max(0.0, 1.0 - center_dist)

    # Convexity / rectangle-ness
    hull_area = cv2.contourArea(corners.reshape(-1, 1, 2).astype(np.float32))
    rectness = float(np.clip(hull_area / max(area, 1.0), 0, 1))

    return float(0.35 * aspect + 0.30 * min(area_ratio / 0.35, 1.0) + 0.20 * center_score + 0.15 * rectness)


def _segmentation_mask(bgr: np.ndarray) -> np.ndarray | None:
    """Optional ONNX segmentation mask (card=1). Returns None if unavailable."""
    try:
        from model_inference import _get_session, _preprocess_crop
        import cv2
        sess = _get_session("segmentation")
        if sess is None:
            return None
        h, w = bgr.shape[:2]
        # TinyUNet trained at 256
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        resized = cv2.resize(rgb, (256, 256), interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0
        x = np.transpose(resized, (2, 0, 1))[None, ...]
        logits = sess.run(None, {sess.get_inputs()[0].name: x})[0]
        prob = 1.0 / (1.0 + np.exp(-np.asarray(logits).reshape(256, 256)))
        mask = (prob > 0.5).astype(np.uint8) * 255
        mask = cv2.resize(mask, (w, h), interpolation=cv2.INTER_NEAREST)
        return mask
    except Exception as e:
        print(f"[extraction] segmentation model skipped: {e}")
        return None


def _collect_quads(bgr: np.ndarray) -> list[tuple[np.ndarray, float, str]]:
    h, w = bgr.shape[:2]
    img_area = float(h * w)
    candidates: list[tuple[np.ndarray, float, str]] = []

    # Learned segmentation first when available
    seg = _segmentation_mask(bgr)
    if seg is not None:
        contours, _ = cv2.findContours(seg, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        contours = sorted(contours, key=cv2.contourArea, reverse=True)[:5]
        for c in contours:
            if cv2.contourArea(c) < img_area * 0.05:
                continue
            quad = _quad_from_contour(c)
            if quad is None:
                continue
            score = _score_candidate(quad, img_area, w, h) + 0.08
            if score > 0.25:
                candidates.append((quad, score, "segmentation"))

    for i, mask in enumerate(_lab_fg_masks(bgr)):
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        contours = sorted(contours, key=cv2.contourArea, reverse=True)[:8]
        for c in contours:
            area = cv2.contourArea(c)
            if area < img_area * 0.05:
                continue
            quad = _quad_from_contour(c)
            if quad is None:
                continue
            score = _score_candidate(quad, img_area, w, h)
            if score > 0.25:
                candidates.append((quad, score, f"mask_{i}"))

    # GrabCut from best seed if we have one, else center rect
    seed = None
    if candidates:
        best_q = max(candidates, key=lambda t: t[1])[0]
        xs, ys = best_q[:, 0], best_q[:, 1]
        seed = (
            int(max(0, xs.min())),
            int(max(0, ys.min())),
            int(min(w, xs.max()) - max(0, xs.min())),
            int(min(h, ys.max()) - max(0, ys.min())),
        )
    gc = _grabcut_quad(bgr, seed)
    if gc is not None:
        score = _score_candidate(gc, img_area, w, h)
        if score > 0.25:
            candidates.append((gc, score + 0.05, "grabcut"))

    # Full-frame fallback when card fills the photo
    full = np.array([[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]], dtype=np.float32)
    full_score = _aspect_score(float(w), float(h)) * 0.55
    if full_score > 0.35:
        candidates.append((full, full_score, "fills_frame"))

    candidates.sort(key=lambda t: t[1], reverse=True)
    return candidates


def warp_card(bgr: np.ndarray, corners: np.ndarray, out_w: int = CANONICAL_W, out_h: int = CANONICAL_H) -> np.ndarray:
    dst = np.array(
        [[0, 0], [out_w - 1, 0], [out_w - 1, out_h - 1], [0, out_h - 1]],
        dtype=np.float32,
    )
    # Orient so longer side is height (portrait card)
    tl, tr, br, bl = corners
    width = (np.linalg.norm(tr - tl) + np.linalg.norm(br - bl)) / 2.0
    height = (np.linalg.norm(bl - tl) + np.linalg.norm(br - tr)) / 2.0
    src = corners
    if width > height * 1.05:
        # Landscape capture of a portrait card — rotate corners CW
        src = np.array([bl, tl, tr, br], dtype=np.float32)
    M = cv2.getPerspectiveTransform(src, dst)
    return cv2.warpPerspective(bgr, M, (out_w, out_h), flags=cv2.INTER_LINEAR)


def _encode_overlay(bgr: np.ndarray, corners: np.ndarray | None) -> str | None:
    try:
        vis = bgr.copy()
        if corners is not None:
            pts = corners.astype(np.int32).reshape((-1, 1, 2))
            cv2.polylines(vis, [pts], True, (0, 220, 80), 3)
            for i, (x, y) in enumerate(corners.astype(int)):
                cv2.circle(vis, (x, y), 8, (0, 140, 255), -1)
                cv2.putText(vis, str(i), (x + 6, y - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        max_dim = 1800
        h, w = vis.shape[:2]
        if max(h, w) > max_dim:
            s = max_dim / max(h, w)
            vis = cv2.resize(vis, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
        ok, buf = cv2.imencode(".jpg", vis, [int(cv2.IMWRITE_JPEG_QUALITY), 95])
        if not ok:
            return None
        import base64
        return "data:image/jpeg;base64," + base64.b64encode(buf).decode("ascii")
    except Exception:
        return None


def extract_card(
    image: Image.Image | np.ndarray,
    max_tilt_deg: float = 28.0,
    require_detection: bool = False,
) -> ExtractionResult:
    """
    Detect and warp the trading card to canonical dimensions.

    If require_detection is True and no good quad is found, returns found=False
    with code card_not_detected instead of a soft inset crop.
    """
    if isinstance(image, Image.Image):
        bgr = pil_to_bgr(image)
    else:
        bgr = image

    h, w = bgr.shape[:2]
    # Work on a downscaled copy for detection speed
    det = bgr
    scale = 1.0
    if max(h, w) > 1400:
        scale = 1400 / max(h, w)
        det = cv2.resize(bgr, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)

    candidates = _collect_quads(det)
    if not candidates:
        if require_detection:
            return ExtractionResult(
                found=False,
                card_bgr=bgr,
                display_bgr=bgr,
                corners=None,
                confidence=0.0,
                method="none",
                code="card_not_detected",
                message="Could not find a card. Use a solid contrasting background and fill most of the frame.",
                overlay_b64=_encode_overlay(bgr, None),
            )
        # Soft inset fallback
        inset_x, inset_y = int(w * 0.06), int(h * 0.06)
        crop = bgr[inset_y : h - inset_y, inset_x : w - inset_x].copy()
        card = cv2.resize(crop, (CANONICAL_W, CANONICAL_H), interpolation=cv2.INTER_AREA)
        return ExtractionResult(
            found=False,
            card_bgr=card,
            display_bgr=bgr,
            corners=None,
            confidence=0.2,
            method="inset_fallback",
            code="card_not_detected",
            message="Card boundary uncertain — grading may be less accurate.",
            meta={"mx": inset_x, "my": inset_y, "card_w": w - 2 * inset_x, "card_h": h - 2 * inset_y},
        )

    corners_s, score, method = candidates[0]
    # Map corners back to full-res
    corners = corners_s / scale if scale != 1.0 else corners_s
    corners = _order_corners(corners)
    tilt = _tilt_from_corners(corners)

    if tilt > max_tilt_deg and require_detection:
        return ExtractionResult(
            found=False,
            card_bgr=bgr,
            display_bgr=bgr,
            corners=corners,
            tilt_deg=tilt,
            confidence=score,
            method=method,
            code="tilted_too_much",
            message=f"Card is tilted ~{tilt:.0f}°. Hold the camera more parallel to the card and retake.",
            overlay_b64=_encode_overlay(bgr, corners),
        )

    warped = warp_card(bgr, corners)
    overlay = _encode_overlay(bgr, corners)

    return ExtractionResult(
        found=True,
        card_bgr=warped,
        display_bgr=bgr,
        corners=corners,
        tilt_deg=tilt,
        confidence=float(min(1.0, score)),
        method=method,
        overlay_b64=overlay,
        meta={
            "mx": 0,
            "my": 0,
            "card_w": CANONICAL_W,
            "card_h": CANONICAL_H,
            "warped": True,
        },
    )

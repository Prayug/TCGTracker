"""Card-in-slab crop and perspective rectification.

Safe geometric transforms only. No denoise, sharpen, upscale, or generative restore.
Never overwrites the original file.
"""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
from PIL import Image


CANONICAL_W = 750
CANONICAL_H = 1050


def _order_corners(pts: np.ndarray) -> np.ndarray:
    pts = pts.reshape(4, 2).astype(np.float32)
    s = pts.sum(axis=1)
    diff = np.diff(pts, axis=1).reshape(-1)
    tl = pts[np.argmin(s)]
    br = pts[np.argmax(s)]
    tr = pts[np.argmin(diff)]
    bl = pts[np.argmax(diff)]
    return np.array([tl, tr, br, bl], dtype=np.float32)


def detect_card_quad(bgr: np.ndarray) -> tuple[np.ndarray | None, float]:
    """Return (4x2 corners, confidence) or (None, 0)."""
    h, w = bgr.shape[:2]
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(gray, 40, 120)
    edges = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=1)
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    best = None
    best_area = 0.0
    image_area = float(h * w)
    for contour in contours:
        area = cv2.contourArea(contour)
        if area < image_area * 0.08:
            continue
        peri = cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, 0.02 * peri, True)
        if len(approx) != 4 or not cv2.isContourConvex(approx):
            rect = cv2.minAreaRect(contour)
            box = cv2.boxPoints(rect)
            approx = box.reshape(4, 1, 2)
        area = cv2.contourArea(approx)
        if area > best_area:
            best_area = area
            best = approx
    if best is None:
        return None, 0.0
    coverage = best_area / image_area
    confidence = float(min(1.0, max(0.0, (coverage - 0.08) / 0.7)))
    return _order_corners(best), confidence


def rectify_card(bgr: np.ndarray, corners: np.ndarray) -> np.ndarray:
    dest = np.array(
        [[0, 0], [CANONICAL_W - 1, 0], [CANONICAL_W - 1, CANONICAL_H - 1], [0, CANONICAL_H - 1]],
        dtype=np.float32,
    )
    matrix = cv2.getPerspectiveTransform(corners, dest)
    return cv2.warpPerspective(
        bgr, matrix, (CANONICAL_W, CANONICAL_H), flags=cv2.INTER_LINEAR
    )


def modest_color_normalize(bgr: np.ndarray) -> np.ndarray:
    """Very mild gray-world white balance. Does not sharpen or denoise."""
    means = bgr.reshape(-1, 3).mean(axis=0)
    means = np.maximum(means, 1.0)
    scale = float(np.mean(means)) / means
    scale = np.clip(scale, 0.92, 1.08)
    out = bgr.astype(np.float32) * scale
    return np.clip(out, 0, 255).astype(np.uint8)


def process_image(src: Path, cropped_dest: Path, rectified_dest: Path) -> dict:
    original = Image.open(src)
    original.load()
    bgr = cv2.cvtColor(np.asarray(original.convert("RGB")), cv2.COLOR_RGB2BGR)
    corners, confidence = detect_card_quad(bgr)
    result = {
        "card_crop_confidence": confidence,
        "perspective_angle_deg": None,
        "card_coverage": None,
        "cropped_written": False,
        "rectified_written": False,
    }
    if corners is None:
        return result
    xs = corners[:, 0]
    ys = corners[:, 1]
    x0, x1 = int(max(0, xs.min())), int(min(bgr.shape[1], xs.max()))
    y0, y1 = int(max(0, ys.min())), int(min(bgr.shape[0], ys.max()))
    crop = bgr[y0:y1, x0:x1]
    if crop.size == 0:
        return result
    coverage = float(crop.shape[0] * crop.shape[1]) / float(bgr.shape[0] * bgr.shape[1])
    result["card_coverage"] = coverage
    vec = corners[1] - corners[0]
    angle = float(np.degrees(np.arctan2(vec[1], vec[0])))
    result["perspective_angle_deg"] = angle
    cropped_dest.parent.mkdir(parents=True, exist_ok=True)
    crop_rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
    Image.fromarray(crop_rgb).save(cropped_dest, quality=95)
    result["cropped_written"] = True
    rectified = modest_color_normalize(rectify_card(bgr, corners))
    rect_rgb = cv2.cvtColor(rectified, cv2.COLOR_BGR2RGB)
    rectified_dest.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rect_rgb).save(rectified_dest, quality=95)
    result["rectified_written"] = True
    return result

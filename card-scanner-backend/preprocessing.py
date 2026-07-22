"""
Enhanced image preprocessing for card grading.

Provides:
1. Card detection via OpenCV (fast path)
2. Card detection via Ollama LLM (fallback for difficult cases)
3. Perspective correction for angled photos
4. Auto-crop to card boundaries
5. Corner crop generation for detailed analysis
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

import cv2
import numpy as np
from PIL import Image


# ── Data Classes ───────────────────────────────────────────────────────────────

@dataclass
class Corners:
    """Four corners of a card in image coordinates."""
    top_left: tuple[int, int]
    top_right: tuple[int, int]
    bottom_left: tuple[int, int]
    bottom_right: tuple[int, int]

    def to_array(self) -> np.ndarray:
        """Convert to numpy array for OpenCV operations."""
        return np.array([
            self.top_left,
            self.top_right,
            self.bottom_right,
            self.bottom_left,
        ], dtype=np.float32)

    @classmethod
    def from_dict(cls, d: dict) -> "Corners":
        """Create from dictionary with topLeft/topRight/bottomLeft/bottomRight keys."""
        return cls(
            top_left=(int(d["topLeft"]["x"]), int(d["topLeft"]["y"])),
            top_right=(int(d["topRight"]["x"]), int(d["topRight"]["y"])),
            bottom_left=(int(d["bottomLeft"]["x"]), int(d["bottomLeft"]["y"])),
            bottom_right=(int(d["bottomRight"]["x"]), int(d["bottomRight"]["y"])),
        )


@dataclass
class CardDetection:
    """Result of card detection."""
    found: bool
    corners: Corners | None
    tilt_deg: float
    fills_frame: bool
    source: str  # "opencv" or "ollama"


@dataclass
class CornerCrop:
    """A cropped corner region."""
    name: str  # "top-left", "top-right", "bottom-left", "bottom-right"
    image: Image.Image
    bbox: tuple[int, int, int, int]  # x, y, width, height


# ── Constants ──────────────────────────────────────────────────────────────────

CORNER_RATIO = 0.20  # Crop 20% of card dimensions for corner analysis
CARD_ASPECT_RATIO = 1.40  # Pokemon cards are ~63:88 ≈ 1.40
MIN_CARD_AREA_RATIO = 0.08  # Card must be at least 8% of image
MAX_CARD_AREA_RATIO = 0.98  # Card must be at most 98% of image


# ── OpenCV Card Detection (Fast Path) ─────────────────────────────────────────

def _sample_background_color(bgr: np.ndarray) -> np.ndarray:
    """Sample background color from corners of image."""
    h, w = bgr.shape[:2]
    margin = max(4, min(h, w) // 12)

    corners = [
        bgr[0:margin, 0:margin],           # top-left
        bgr[0:margin, w - margin:w],       # top-right
        bgr[h - margin:h, 0:margin],       # bottom-left
        bgr[h - margin:h, w - margin:w],   # bottom-right
    ]

    # Average color from corners
    all_pixels = np.concatenate([c.reshape(-1, 3) for c in corners])
    bg_median = np.median(all_pixels, axis=0).astype(np.uint8)

    # Check if card fills frame: corners may contain card pixels
    center = bgr[h // 3 : 2 * h // 3, w // 3 : 2 * w // 3]
    center_color = np.median(center.reshape(-1, 3), axis=0).astype(np.uint8)
    if np.linalg.norm(bg_median.astype(float) - center_color.astype(float)) < 15:
        # Use the brightest corner patch as best background estimate
        brightness = [float(np.mean(p)) for p in corners]
        brightest = corners[int(np.argmax(brightness))]
        return np.median(brightest.reshape(-1, 3), axis=0).astype(np.uint8)

    return bg_median


def detect_card_opencv(image: Image.Image) -> CardDetection:
    """
    Detect card using OpenCV contour analysis (fast path).

    This works well for:
    - Cards on solid backgrounds
    - Cards that are mostly straight
    - Good lighting conditions

    Falls back to corners=None for difficult cases.
    """
    # Convert to OpenCV format
    img_array = np.array(image)
    if len(img_array.shape) == 3 and img_array.shape[2] == 3:
        bgr = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)
    else:
        bgr = img_array

    h, w = bgr.shape[:2]
    img_area = h * w

    # Sample background color
    bg = _sample_background_color(bgr)

    # Convert to Lab color space for better color separation
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    bg_bgr = np.uint8([[bg]])
    bg_lab = cv2.cvtColor(bg_bgr, cv2.COLOR_BGR2LAB).astype(np.float32)[0, 0]

    # Distance from background
    dist = np.linalg.norm(lab - bg_lab, axis=2)

    # Adaptive threshold
    sh, sw = max(4, h // 12), max(4, w // 12)
    corner_dist = np.concatenate([
        dist[0:sh, 0:sw].ravel(),
        dist[0:sh, w - sw:w].ravel(),
        dist[h - sh:h, 0:sw].ravel(),
        dist[h - sh:h, w - sw:w].ravel(),
    ])
    floor = float(np.percentile(corner_dist, 90))
    thresh = max(14.0, floor * 2.5 + 5.0)

    mask = (dist > thresh).astype(np.uint8) * 255

    # Morphological cleanup
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN,
                           cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5)),
                           iterations=1)

    # Find contours
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return CardDetection(
            found=False, corners=None, tilt_deg=0,
            fills_frame=False, source="opencv"
        )

    # Find best card-like contour
    best_contour = None
    best_score = -1.0

    for c in contours:
        area = cv2.contourArea(c)
        if area < img_area * MIN_CARD_AREA_RATIO or area > img_area * MAX_CARD_AREA_RATIO:
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
        score *= 1.0 - min(abs(aspect - CARD_ASPECT_RATIO), abs(aspect - 1/CARD_ASPECT_RATIO)) * 0.15

        if score > best_score:
            best_score = score
            best_contour = c

    if best_contour is None:
        return CardDetection(
            found=False, corners=None, tilt_deg=0,
            fills_frame=False, source="opencv"
        )

    # Get minimum area rectangle
    rect = cv2.minAreaRect(best_contour)
    box = cv2.boxPoints(rect)
    box = _order_corners(box)

    # Calculate tilt angle
    tilt_deg = _calculate_tilt(box)

    # Create Corners object
    corners = Corners(
        top_left=(int(box[0][0]), int(box[0][1])),
        top_right=(int(box[1][0]), int(box[1][1])),
        bottom_right=(int(box[2][0]), int(box[2][1])),
        bottom_left=(int(box[3][0]), int(box[3][1])),
    )

    # Check if card fills the frame
    area_ratio = cv2.contourArea(best_contour) / img_area
    fills_frame = area_ratio > 0.85

    return CardDetection(
        found=True,
        corners=corners,
        tilt_deg=tilt_deg,
        fills_frame=fills_frame,
        source="opencv",
    )


def _order_corners(pts: np.ndarray) -> np.ndarray:
    """Order corners as: top-left, top-right, bottom-right, bottom-left."""
    rect = np.zeros((4, 2), dtype=np.float32)

    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]  # top-left
    rect[2] = pts[np.argmax(s)]  # bottom-right

    d = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(d)]  # top-right
    rect[3] = pts[np.argmax(d)]  # bottom-left

    return rect


def _calculate_tilt(corners: np.ndarray) -> float:
    """Calculate tilt angle from corners in degrees."""
    tl, tr, bl, br = corners

    # Average top and bottom angles
    top_angle = math.atan2(tr[1] - tl[1], tr[0] - tl[0])
    bottom_angle = math.atan2(br[1] - bl[1], br[0] - bl[0])

    tilt_rad = (top_angle + bottom_angle) / 2
    tilt_deg = tilt_rad * (180 / math.pi)

    # Filter out unreasonable tilt
    if abs(tilt_deg) > 30:
        tilt_deg = 0

    return round(tilt_deg, 2)


# ── Perspective Correction ────────────────────────────────────────────────────

def correct_perspective(
    image: Image.Image,
    corners: Corners,
    output_width: int | None = None,
    output_height: int | None = None,
) -> Image.Image:
    """
    Apply perspective correction to straighten an angled card.

    Args:
        image: Input PIL Image
        corners: Four corners of the card
        output_width: Output width (default: max of input card dimensions)
        output_height: Output height (default: maintains aspect ratio)

    Returns:
        Corrected PIL Image
    """
    # Convert to numpy array
    img_array = np.array(image)

    # Get corner points
    src_pts = corners.to_array()

    # Calculate output dimensions
    if output_width is None or output_height is None:
        # Calculate dimensions based on card aspect ratio
        card_width = max(
            np.linalg.norm(corners.top_right - corners.top_left),
            np.linalg.norm(corners.bottom_right - corners.bottom_left),
        )
        card_height = max(
            np.linalg.norm(corners.bottom_left - corners.top_left),
            np.linalg.norm(corners.bottom_right - corners.top_right),
        )

        # Maintain Pokemon card aspect ratio (63:88)
        target_ratio = 63.0 / 88.0

        if output_width is None and output_height is None:
            # Use card dimensions, maintaining aspect ratio
            if card_height / card_width > target_ratio:
                output_height = int(card_height)
                output_width = int(output_height / target_ratio)
            else:
                output_width = int(card_width)
                output_height = int(output_width * target_ratio)
        elif output_width is None:
            output_width = int(output_height / target_ratio)
        else:
            output_height = int(output_width * target_ratio)

    # Destination points (rectangle)
    dst_pts = np.array([
        [0, 0],
        [output_width - 1, 0],
        [output_width - 1, output_height - 1],
        [0, output_height - 1],
    ], dtype=np.float32)

    # Calculate perspective transform matrix
    matrix = cv2.getPerspectiveTransform(src_pts, dst_pts)

    # Apply perspective warp
    warped = cv2.warpPerspective(img_array, matrix, (output_width, output_height))

    return Image.fromarray(warped)


# ── Corner Crop Generation ────────────────────────────────────────────────────

def generate_corner_crops(
    image: Image.Image,
    corners: Corners | None = None,
    ratio: float = CORNER_RATIO,
) -> list[CornerCrop]:
    """
    Generate corner crops for detailed analysis.

    Args:
        image: PIL Image of the card
        corners: Optional corners (if None, crops full image corners)
        ratio: Ratio of card dimensions to crop (default: 20%)

    Returns:
        List of 4 CornerCrop objects
    """
    img_width, img_height = image.size

    if corners is not None:
        # Calculate crop dimensions based on card size
        card_width = max(
            math.dist(corners.top_left, corners.top_right),
            math.dist(corners.bottom_left, corners.bottom_right),
        )
        card_height = max(
            math.dist(corners.top_left, corners.bottom_left),
            math.dist(corners.top_right, corners.bottom_right),
        )

        crop_w = int(card_width * ratio)
        crop_h = int(card_height * ratio)

        # Calculate bounding box for each corner
        corners_list = [
            ("top-left", corners.top_left, (0, 0)),
            ("top-right", corners.top_right, (img_width - crop_w, 0)),
            ("bottom-left", corners.bottom_left, (0, img_height - crop_h)),
            ("bottom-right", corners.bottom_right, (img_width - crop_w, img_height - crop_h)),
        ]
    else:
        # Crop from image corners
        crop_w = int(img_width * ratio)
        crop_h = int(img_height * ratio)

        corners_list = [
            ("top-left", None, (0, 0)),
            ("top-right", None, (img_width - crop_w, 0)),
            ("bottom-left", None, (0, img_height - crop_h)),
            ("bottom-right", None, (img_width - crop_w, img_height - crop_h)),
        ]

    crops = []
    for name, _, (x, y) in corners_list:
        # Ensure coordinates are within bounds
        x = max(0, min(x, img_width - crop_w))
        y = max(0, min(y, img_height - crop_h))

        crop = image.crop((x, y, x + crop_w, y + crop_h))
        crops.append(CornerCrop(
            name=name,
            image=crop,
            bbox=(x, y, crop_w, crop_h),
        ))

    return crops


# ── Hybrid Detection ───────────────────────────────────────────────────────────

def detect_card_hybrid(
    image: Image.Image,
    use_ollama_fallback: bool = False,
    ollama_model: str = "gemma3:4b",
) -> CardDetection:
    """
    Hybrid card detection: try OpenCV first, fallback to Ollama if needed.

    Args:
        image: PIL Image
        use_ollama_fallback: Whether to use Ollama if OpenCV fails
        ollama_model: Ollama model to use for fallback

    Returns:
        CardDetection result
    """
    # Try OpenCV first (fast path)
    opencv_result = detect_card_opencv(image)

    if opencv_result.found:
        return opencv_result

    # Fallback to Ollama if enabled
    if use_ollama_fallback:
        try:
            from ollama_grader import detect_card_with_ollama

            ollama_result = detect_card_with_ollama(image, model=ollama_model)
            if ollama_result and ollama_result.get("corners"):
                corners = Corners.from_dict(ollama_result["corners"])
                return CardDetection(
                    found=True,
                    corners=corners,
                    tilt_deg=ollama_result.get("tilt_deg", 0),
                    fills_frame=ollama_result.get("fills_frame", False),
                    source="ollama",
                )
        except Exception as e:
            print(f"[preprocessing] Ollama fallback failed: {e}")

    # Return failed detection
    return opencv_result


# ── Full Preprocessing Pipeline ───────────────────────────────────────────────

@dataclass
class PreprocessedCard:
    """Result of card preprocessing."""
    original: Image.Image
    card_image: Image.Image  # Perspective-corrected card
    detection: CardDetection
    corner_crops: list[CornerCrop]
    preprocessing_time_ms: int


def preprocess_card(
    image: Image.Image,
    use_ollama_fallback: bool = False,
    ollama_model: str = "gemma3:4b",
) -> PreprocessedCard:
    """
    Full preprocessing pipeline for card grading.

    Steps:
    1. Detect card (OpenCV fast path, Ollama fallback)
    2. Apply perspective correction if tilted
    3. Generate corner crops for detailed analysis

    Args:
        image: Input PIL Image
        use_ollama_fallback: Whether to use Ollama if OpenCV fails
        ollama_model: Ollama model to use

    Returns:
        PreprocessedCard with all results
    """
    import time
    start_time = time.time()

    # Step 1: Detect card
    detection = detect_card_hybrid(image, use_ollama_fallback, ollama_model)

    # Step 2: Apply perspective correction if needed
    if detection.found and detection.corners is not None and abs(detection.tilt_deg) > 0.5:
        card_image = correct_perspective(image, detection.corners)
    elif detection.found and detection.corners is not None:
        # Crop to card boundaries
        corners = detection.corners
        x = min(corners.top_left[0], corners.bottom_left[0])
        y = min(corners.top_left[1], corners.top_right[1])
        x2 = max(corners.top_right[0], corners.bottom_right[0])
        y2 = max(corners.bottom_left[1], corners.bottom_right[1])

        # Ensure within bounds
        w, h = image.size
        x = max(0, min(x, w))
        y = max(0, min(y, h))
        x2 = max(0, min(x2, w))
        y2 = max(0, min(y2, h))

        if x2 > x and y2 > y:
            card_image = image.crop((x, y, x2, y2))
        else:
            card_image = image
    else:
        # No detection, use original with slight crop
        w, h = image.size
        margin = int(min(w, h) * 0.05)
        card_image = image.crop((margin, margin, w - margin, h - margin))

    # Step 3: Generate corner crops
    corner_crops = generate_corner_crops(card_image)

    elapsed_ms = int((time.time() - start_time) * 1000)

    return PreprocessedCard(
        original=image,
        card_image=card_image,
        detection=detection,
        corner_crops=corner_crops,
        preprocessing_time_ms=elapsed_ms,
    )


# ── Testing ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python preprocessing.py <image_path>")
        print("Example: python preprocessing.py test_card.jpg")
        sys.exit(1)

    image_path = sys.argv[1]
    try:
        image = Image.open(image_path)
        print(f"Processing {image_path}...")

        result = preprocess_card(image, use_ollama_fallback=False)

        print(f"\n=== Preprocessing Result ===")
        print(f"Card Found: {result.detection.found}")
        print(f"Source: {result.detection.source}")
        print(f"Tilt: {result.detection.tilt_deg}°")
        print(f"Fills Frame: {result.detection.fills_frame}")
        print(f"Card Size: {result.card_image.size}")
        print(f"Corner Crops: {len(result.corner_crops)}")
        print(f"Processing Time: {result.preprocessing_time_ms}ms")

        # Save crops for inspection
        for i, crop in enumerate(result.corner_crops):
            crop.image.save(f"crop_{i}_{crop.name}.jpg")
            print(f"Saved: crop_{i}_{crop.name}.jpg")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

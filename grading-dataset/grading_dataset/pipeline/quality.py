"""Image quality metrics. No enhancement that could invent or hide defects."""

from __future__ import annotations

import numpy as np
from PIL import Image

from grading_dataset.schema import ImageQualityMetrics


def _to_gray(image: Image.Image) -> np.ndarray:
    return np.asarray(image.convert("L"), dtype=np.float32)


def blur_score(gray: np.ndarray) -> float:
    """Normalized Laplacian variance. Higher is sharper. Not upscaled."""
    if gray.size < 16:
        return 0.0
    kernel = np.array([[0, 1, 0], [1, -4, 1], [0, 1, 0]], dtype=np.float32)
    padded = np.pad(gray, 1, mode="edge")
    acc = np.zeros_like(gray)
    for i in range(3):
        for j in range(3):
            acc += kernel[i, j] * padded[i : i + gray.shape[0], j : j + gray.shape[1]]
    var = float(acc.var())
    return float(min(1.0, var / 500.0))


def glare_fraction(image: Image.Image) -> float:
    arr = np.asarray(image.convert("RGB"), dtype=np.float32)
    if arr.size == 0:
        return 1.0
    luma = 0.2126 * arr[:, :, 0] + 0.7152 * arr[:, :, 1] + 0.0722 * arr[:, :, 2]
    sat = arr.std(axis=2)
    glare = (luma > 245) & (sat < 12)
    return float(glare.mean())


def blank_fraction(gray: np.ndarray) -> float:
    if gray.size == 0:
        return 1.0
    return float(((gray > 245) | (gray < 10)).mean())


def measure_image(image: Image.Image) -> ImageQualityMetrics:
    gray = _to_gray(image)
    width, height = image.size
    shortest = min(width, height)
    return ImageQualityMetrics(
        blur_score=blur_score(gray),
        glare_fraction=glare_fraction(image),
        exposure_mean=float(gray.mean() / 255.0),
        perspective_angle_deg=None,
        card_coverage=None,
        card_crop_confidence=None,
        image_width=width,
        image_height=height,
        shortest_side=shortest,
    )

"""
Probabilistic defect records + spatial merging.

Overlapping boxes that describe the same wear (top whitening + top-left
whitening + left-edge whitening) must not quadruple-penalize the grade.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


SEVERITY_RANK = {
    "none": 0,
    "trace": 1,
    "light": 2,
    "moderate": 3,
    "heavy": 4,
    "severe": 5,
}


@dataclass
class Detection:
    label: str
    kind: str  # whitening | scratch | crease | tear | dent | chip | wear | other
    category: str  # corners | edges | surface | centering
    severity: str
    confidence: float
    coverage: float = 0.0
    location: dict[str, float] | None = None
    side: str | None = None

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "label": self.label,
            "kind": self.kind,
            "category": self.category,
            "severity": self.severity,
            "confidence": round(float(self.confidence), 3),
            "coverage": round(float(self.coverage), 4),
        }
        if self.location:
            d["location"] = self.location
        if self.side:
            d["side"] = self.side
        return d

    def display_label(self) -> str:
        pct = int(round(self.confidence * 100))
        if self.confidence >= 0.85:
            prefix = self.label
        elif self.confidence >= 0.65:
            if self.label.lower().startswith("possible"):
                prefix = self.label
            else:
                prefix = f"Possible {self.label[0].lower() + self.label[1:]}" if self.label else self.label
        else:
            prefix = f"Uncertain {self.label[0].lower() + self.label[1:]}" if self.label else self.label
        return f"{prefix} ({pct}%)"


def detection_from_frac(
    *,
    label: str,
    kind: str,
    category: str,
    frac: float,
    location: dict[str, float] | None = None,
    heavy_at: float = 0.22,
    moderate_at: float = 0.12,
    light_at: float = 0.05,
) -> Detection:
    """Map an affected-area fraction to severity + confidence."""
    if frac >= heavy_at:
        severity = "heavy" if frac < heavy_at * 1.6 else "severe"
        conf = min(0.97, 0.72 + (frac - heavy_at) * 1.4)
    elif frac >= moderate_at:
        severity = "moderate"
        conf = min(0.88, 0.62 + (frac - moderate_at) * 2.0)
    elif frac >= light_at:
        severity = "light"
        conf = min(0.78, 0.50 + (frac - light_at) * 2.4)
    elif frac > 0.02:
        severity = "trace"
        conf = 0.42 + frac * 4
    else:
        severity = "none"
        conf = 0.25
    return Detection(
        label=label,
        kind=kind,
        category=category,
        severity=severity,
        confidence=float(max(0.2, min(0.98, conf))),
        coverage=float(frac),
        location=location,
    )


def iou(a: dict[str, float], b: dict[str, float]) -> float:
    ax1, ay1 = a["x"], a["y"]
    ax2, ay2 = ax1 + a["width"], ay1 + a["height"]
    bx1, by1 = b["x"], b["y"]
    bx2, by2 = bx1 + b["width"], by1 + b["height"]
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
    inter = iw * ih
    if inter <= 0:
        return 0.0
    area_a = max(1e-9, a["width"] * a["height"])
    area_b = max(1e-9, b["width"] * b["height"])
    return inter / (area_a + area_b - inter)


def _union_box(boxes: list[dict[str, float]]) -> dict[str, float]:
    x1 = min(b["x"] for b in boxes)
    y1 = min(b["y"] for b in boxes)
    x2 = max(b["x"] + b["width"] for b in boxes)
    y2 = max(b["y"] + b["height"] for b in boxes)
    return {"x": x1, "y": y1, "width": x2 - x1, "height": y2 - y1}


def _boxes_related(a: dict[str, float], b: dict[str, float], iou_thresh: float) -> bool:
    if iou(a, b) >= iou_thresh:
        return True
    # Require a real overlap. A 5% pad used to chain every edge into one
    # card-sized blob labeled "central area".
    ax1, ay1 = a["x"], a["y"]
    ax2, ay2 = a["x"] + a["width"], a["y"] + a["height"]
    bx1, by1 = b["x"], b["y"]
    bx2, by2 = b["x"] + b["width"], b["y"] + b["height"]
    return ax1 < bx2 and ax2 > bx1 and ay1 < by2 and ay2 > by1


def merge_detections(
    detections: list[Detection],
    *,
    iou_thresh: float = 0.28,
) -> list[Detection]:
    """
    Greedy NMS-style grouping of same-kind detections that overlap.

    Coverage becomes the union area (clamped). Confidence is the max.
    Severity is the max rank. Label describes the combined region.
    """
    remaining = [d for d in detections if d.severity != "none"]
    remaining.sort(key=lambda d: (-d.confidence, -SEVERITY_RANK.get(d.severity, 0)))
    merged: list[Detection] = []

    while remaining:
        seed = remaining.pop(0)
        cluster = [seed]
        changed = True
        while changed:
            changed = False
            rest: list[Detection] = []
            for other in remaining:
                same = other.kind == seed.kind and other.category == seed.category
                overlap = False
                if same:
                    for member in cluster:
                        if member.location and other.location:
                            if _boxes_related(member.location, other.location, iou_thresh):
                                overlap = True
                                break
                        elif not member.location and not other.location:
                            overlap = True
                            break
                if overlap:
                    cluster.append(other)
                    changed = True
                else:
                    rest.append(other)
            remaining = rest

        boxes = [d.location for d in cluster if d.location]
        loc_union = _union_box(boxes) if boxes else seed.location
        # Transitive edge chaining wraps the card. Keep the seed plus boxes
        # that actually overlap it; leftover members are merged on their own.
        if (
            loc_union
            and loc_union["width"] * loc_union["height"] > 0.42
            and seed.location
            and len(cluster) > 2
        ):
            direct = [seed]
            leftover: list[Detection] = []
            for other in cluster:
                if other is seed:
                    continue
                if other.location and _boxes_related(seed.location, other.location, iou_thresh):
                    direct.append(other)
                else:
                    leftover.append(other)
            remaining = leftover + remaining
            cluster = direct
            boxes = [d.location for d in cluster if d.location]
            loc_union = _union_box(boxes) if boxes else seed.location

        coverage = max(d.coverage for d in cluster)
        # Overlay the strongest finding, not the AABB union (that covers artwork).
        loc = seed.location
        sev = max(cluster, key=lambda d: SEVERITY_RANK.get(d.severity, 0)).severity
        conf = max(d.confidence for d in cluster)
        if len(cluster) == 1:
            merged.append(cluster[0])
            continue

        union_area = (
            float(loc_union["width"] * loc_union["height"]) if loc_union else 0.0
        )
        if loc_union and union_area > 0.28:
            region = "multiple edges"
        elif loc_union:
            region = _region_phrase(loc_union)
        else:
            region = "perimeter"
        kind_word = seed.kind.replace("-", " ")
        label = f"{sev.title()} {kind_word} — primarily {region}"
        merged.append(
            Detection(
                label=label,
                kind=seed.kind,
                category=seed.category,
                severity=sev,
                confidence=conf,
                coverage=min(1.0, coverage),
                location=loc,
                side=seed.side,
            )
        )
    return merged


def _region_phrase(box: dict[str, float]) -> str:
    if box["width"] * box["height"] > 0.28 or (
        box["width"] >= 0.55 and box["height"] >= 0.28
    ):
        return "multiple edges"
    cx = box["x"] + box["width"] / 2
    cy = box["y"] + box["height"] / 2
    horiz = "left" if cx < 0.38 else "right" if cx > 0.62 else "center"
    vert = "upper" if cy < 0.38 else "lower" if cy > 0.62 else "mid"
    if vert == "upper" and horiz != "center":
        return f"{vert}-{horiz} and top edge"
    if vert == "lower" and horiz != "center":
        return f"{vert}-{horiz} and bottom edge"
    if horiz == "center" and vert == "upper":
        return "top edge"
    if horiz == "center" and vert == "lower":
        return "bottom edge"
    if vert == "mid" and horiz != "center":
        return f"{horiz} edge"
    return "central area"


def grade_weight(detection: Detection) -> float:
    """
    How much a detection should move the grade. A 58% call barely counts;
    a 98% heavy finding counts fully.
    """
    if detection.confidence < 0.55:
        return 0.0
    sev = SEVERITY_RANK.get(detection.severity, 0)
    return (detection.confidence ** 1.4) * (sev / 5.0)


def detections_to_defect_strings(detections: list[Detection], min_conf: float = 0.65) -> list[str]:
    """Human strings for the existing defects[] field. Low-confidence stays off this list."""
    out: list[str] = []
    for d in detections:
        if d.confidence < min_conf or d.severity in ("none", "trace"):
            continue
        out.append(d.display_label())
    return out

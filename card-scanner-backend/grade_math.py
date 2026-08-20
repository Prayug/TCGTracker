"""
Bottleneck grade math — not a four-way average.

Professional grading behaves like a constraint system: a 5 surface with 9.5
centering is not an 8. High-confidence structural defects impose ceilings.
Low-confidence detections barely move the number. Missing/refused surface
widens the range instead of inventing a decimal.
"""

from __future__ import annotations

from typing import Any

from defect_grouping import Detection, SEVERITY_RANK, grade_weight


def confidence_band(conf: float) -> str:
    if conf >= 0.8:
        return "high"
    if conf >= 0.55:
        return "moderate"
    return "low"


def bottleneck_overall(
    scores: dict[str, float | None],
    detections: list[Detection],
    *,
    surface_ok: bool = True,
) -> dict[str, Any]:
    usable = [(k, v) for k, v in scores.items() if v is not None]
    if not usable:
        return {
            "grade": 5.0,
            "low": 3,
            "high": 7,
            "mass": ordinal_psa_mass(5.0, spread=2.2),
        }

    values = [v for _, v in usable]
    avg = sum(values) / len(values)
    worst = min(values)
    overall = avg * 0.25 + worst * 0.75

    for det in detections:
        w = grade_weight(det)
        if w <= 0:
            continue
        if det.kind in ("crease", "fold") and det.severity in ("heavy", "severe") and det.confidence >= 0.85:
            overall = min(overall, 4.0)
        elif det.kind == "tear" and det.confidence >= 0.85:
            overall = min(overall, 2.0)
        elif det.kind == "dent" and det.severity in ("heavy", "severe") and det.confidence >= 0.85:
            overall = min(overall, 5.0)
        elif det.kind == "whitening" and det.severity == "severe" and det.confidence >= 0.9:
            overall = min(overall, 6.0)
        elif w > 0.55:
            overall -= min(1.2, w * 0.8)

    overall = max(1.0, min(10.0, overall))

    spread = 0.85
    if not surface_ok:
        spread = max(spread, 1.8)
    if any(d.confidence < 0.7 and d.severity in ("heavy", "severe", "moderate") for d in detections):
        spread += 0.4

    low = max(1, int(round(overall - spread)))
    high = min(10, int(round(overall + spread)))
    if high < low:
        high = low
    if high == low and not surface_ok:
        high = min(10, low + 1)
        low = max(1, high - 2) if overall < 8 else low

    # PSA uses 1, 1.5, then integers. Keep 1.5 only at the very bottom.
    if low < 2:
        pass
    else:
        low = max(1, low)

    return {
        "grade": round(overall, 1),
        "low": low,
        "high": high,
        "mass": ordinal_psa_mass(overall, spread=spread),
    }


def ordinal_psa_mass(center: float, spread: float = 1.0) -> list[dict[str, Any]]:
    """Softmax-like mass over PSA 1–10 (1.5 folded into 1/2)."""
    grades = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    weights: list[float] = []
    for g in grades:
        dist = abs(g - center)
        # 1.5 lives between 1 and 2
        if center < 1.75 and g == 1:
            dist = min(dist, abs(1.5 - center))
        w = pow(2.71828, -((dist / max(0.45, spread)) ** 2))
        weights.append(w)
    total = sum(weights) or 1.0
    mass = []
    for g, w in zip(grades, weights):
        pct = 100.0 * w / total
        if pct >= 3.5:
            mass.append({"grade": g, "pct": int(round(pct))})
    # Renormalize after dropping tiny bins
    s = sum(m["pct"] for m in mass) or 1
    if s != 100 and mass:
        mass[0]["pct"] += 100 - s
    mass.sort(key=lambda m: -m["pct"])
    return mass[:5]


def category_range(score: float | None, conf: float, withheld: bool) -> dict[str, Any]:
    if withheld or score is None:
        return {
            "score": None,
            "low": 5,
            "high": 8,
            "band": "low",
            "withheld": True,
        }
    pad = 0.4 if conf >= 0.8 else 0.9 if conf >= 0.55 else 1.4
    low = max(1.0, round(score - pad, 1))
    high = min(10.0, round(score + pad, 1))
    return {
        "score": score,
        "low": low,
        "high": high,
        "band": confidence_band(conf),
        "withheld": False,
    }

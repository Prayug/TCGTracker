"""
Prepare corner / edge / surface training crops from card images + grades.

Usage:
  python -m ml.datasets.prepare_crops --raw ml/data/raw/psa --out ml/data/crops
"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


def _load_bgr(path: Path) -> np.ndarray:
    img = Image.open(path).convert("RGB")
    return cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)


def corner_crops(card: np.ndarray, ratio: float = 0.2) -> dict[str, np.ndarray]:
    h, w = card.shape[:2]
    cw, ch = max(32, int(w * ratio)), max(32, int(h * ratio))
    return {
        "tl": card[0:ch, 0:cw],
        "tr": card[0:ch, w - cw : w],
        "bl": card[h - ch : h, 0:cw],
        "br": card[h - ch : h, w - cw : w],
    }


def edge_crops(card: np.ndarray, ratio: float = 0.08) -> dict[str, np.ndarray]:
    h, w = card.shape[:2]
    t = max(12, int(min(h, w) * ratio))
    return {
        "top": card[0:t, :],
        "bottom": card[h - t : h, :],
        "left": card[:, 0:t],
        "right": card[:, w - t : w],
    }


def parse_grade(name: str, meta_grade) -> float:
    if meta_grade is not None:
        try:
            return float(meta_grade)
        except (TypeError, ValueError):
            pass
    # filename …_g9.5.jpg or _g10.jpg
    import re
    m = re.search(r"_g(\d+(?:\.\d+)?)", name)
    if m:
        return float(m.group(1))
    return 7.0


def prepare(raw_dir: Path, out_dir: Path) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    for axis in ("corners", "edges", "surface"):
        (out_dir / axis).mkdir(exist_ok=True)

    manifest_path = raw_dir / "manifest.json"
    rows = []
    if manifest_path.exists():
        rows = json.loads(manifest_path.read_text())
    else:
        for p in sorted(raw_dir.glob("*.jpg")) + sorted(raw_dir.glob("*.png")):
            rows.append({"file": p.name, "grade": None})

    index = []
    for row in rows:
        path = raw_dir / row["file"]
        if not path.exists():
            continue
        try:
            card = _load_bgr(path)
        except Exception:
            continue
        # Light resize for consistency
        h, w = card.shape[:2]
        if max(h, w) > 1200:
            s = 1200 / max(h, w)
            card = cv2.resize(card, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)

        grade = parse_grade(row["file"], row.get("grade"))
        stem = Path(row["file"]).stem

        for name, crop in corner_crops(card).items():
            fname = f"{stem}_{name}.jpg"
            cv2.imwrite(str(out_dir / "corners" / fname), crop, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
            index.append({"axis": "corners", "file": f"corners/{fname}", "grade": grade})

        for name, crop in edge_crops(card).items():
            fname = f"{stem}_{name}.jpg"
            cv2.imwrite(str(out_dir / "edges" / fname), crop, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
            index.append({"axis": "edges", "file": f"edges/{fname}", "grade": grade})

        fname = f"{stem}_full.jpg"
        cv2.imwrite(str(out_dir / "surface" / fname), card, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
        index.append({"axis": "surface", "file": f"surface/{fname}", "grade": grade})

    (out_dir / "index.json").write_text(json.dumps(index, indent=2))
    print(f"Prepared {len(index)} crops → {out_dir}")
    return {"count": len(index)}


def synthesize_bootstrap(out_dir: Path, n: int = 400) -> dict:
    """
    Generate synthetic card-like images with controlled whitening / scratches
    so we can train exportable ONNX models without waiting on HF downloads.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    for axis in ("corners", "edges", "surface"):
        (out_dir / axis).mkdir(exist_ok=True)

    rng = np.random.default_rng(42)
    index = []

    for i in range(n):
        # Base "card" with border
        h, w = 880, 630
        card = np.full((h, w, 3), 40, dtype=np.uint8)
        # Art region
        art = rng.integers(30, 200, size=(h - 80, w - 80, 3), dtype=np.uint8)
        card[40 : h - 40, 40 : w - 40] = art
        # Yellow border-ish
        card[:40, :] = (30, 180, 220)
        card[h - 40 :, :] = (30, 180, 220)
        card[:, :40] = (30, 180, 220)
        card[:, w - 40 :] = (30, 180, 220)

        # Condition severity 0 (mint) → 1 (damaged)
        severity = float(rng.random())
        grade = round((10.0 - severity * 8.5) * 2) / 2
        grade = float(np.clip(grade, 1.0, 10.0))

        if severity > 0.15:
            # Corner whitening
            for (y0, x0) in [(0, 0), (0, w - 50), (h - 50, 0), (h - 50, w - 50)]:
                if rng.random() < severity:
                    cv2.circle(card, (x0 + 25, y0 + 25), int(8 + severity * 20), (245, 245, 245), -1)
        if severity > 0.25:
            # Edge whitening strips
            thick = int(2 + severity * 8)
            if rng.random() < 0.7:
                card[0:thick, 40 : w - 40] = (240, 240, 240)
            if rng.random() < 0.7:
                card[h - thick : h, 40 : w - 40] = (240, 240, 240)
        if severity > 0.35:
            # Scratches
            for _ in range(int(severity * 12)):
                x1, y1 = int(rng.integers(50, w - 50)), int(rng.integers(50, h - 50))
                x2, y2 = x1 + int(rng.integers(-80, 80)), y1 + int(rng.integers(-80, 80))
                cv2.line(card, (x1, y1), (x2, y2), (220, 220, 220), 1)

        # Mild phone-like augment
        if rng.random() < 0.4:
            card = cv2.GaussianBlur(card, (3, 3), 0)
        if rng.random() < 0.3:
            noise = rng.normal(0, 6, card.shape).astype(np.float32)
            card = np.clip(card.astype(np.float32) + noise, 0, 255).astype(np.uint8)

        stem = f"syn_{i:04d}"
        for name, crop in corner_crops(card).items():
            fname = f"{stem}_{name}.jpg"
            cv2.imwrite(str(out_dir / "corners" / fname), crop)
            index.append({"axis": "corners", "file": f"corners/{fname}", "grade": grade})
        for name, crop in edge_crops(card).items():
            fname = f"{stem}_{name}.jpg"
            cv2.imwrite(str(out_dir / "edges" / fname), crop)
            index.append({"axis": "edges", "file": f"edges/{fname}", "grade": grade})
        fname = f"{stem}_full.jpg"
        cv2.imwrite(str(out_dir / "surface" / fname), card)
        index.append({"axis": "surface", "file": f"surface/{fname}", "grade": grade})

    (out_dir / "index.json").write_text(json.dumps(index, indent=2))
    print(f"Synthetic bootstrap: {len(index)} crops → {out_dir}")
    return {"count": len(index)}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--raw", type=Path, default=None)
    p.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[1] / "data" / "crops")
    p.add_argument("--synthesize", type=int, default=0, help="Also generate N synthetic cards")
    args = p.parse_args()
    if args.raw and args.raw.exists():
        prepare(args.raw, args.out)
    if args.synthesize > 0 or not (args.out / "index.json").exists():
        n = args.synthesize or 400
        synthesize_bootstrap(args.out, n)


if __name__ == "__main__":
    main()

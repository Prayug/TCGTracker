"""
Evaluate axis models on a holdout split and write a short report.

Usage:
  python -m ml.eval_report --data ml/data/crops --models-dir models
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np


def eval_onnx(models_dir: Path, data_dir: Path) -> dict:
    try:
        import onnxruntime as ort
    except ImportError:
        return {"error": "onnxruntime not installed"}

    index = json.loads((data_dir / "index.json").read_text())
    report: dict = {"axes": {}}

    for axis in ("corners", "edges", "surface"):
        onnx_path = models_dir / f"{axis}.onnx"
        if not onnx_path.exists():
            report["axes"][axis] = {"skipped": True, "reason": "missing onnx"}
            continue
        sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
        items = [x for x in index if x["axis"] == axis][-200:]  # holdout-ish tail
        errs = []
        within1 = 0
        for row in items:
            bgr = cv2.imread(str(data_dir / row["file"]))
            if bgr is None:
                continue
            rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
            resized = cv2.resize(rgb, (224, 224)).astype(np.float32) / 255.0
            mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
            std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
            x = ((resized - mean) / std).transpose(2, 0, 1)[None, ...]
            pred = float(np.asarray(sess.run(None, {"input": x})[0]).reshape(-1)[0])
            true = float(row["grade"])
            err = abs(pred - true)
            errs.append(err)
            if err <= 1.0:
                within1 += 1
        if not errs:
            report["axes"][axis] = {"skipped": True, "reason": "no samples"}
            continue
        report["axes"][axis] = {
            "n": len(errs),
            "mae": round(float(np.mean(errs)), 3),
            "within1": round(within1 / len(errs), 3),
        }

    out = models_dir / "eval_report.json"
    out.write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    return report


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--data", type=Path, default=Path(__file__).parent / "data" / "crops")
    p.add_argument("--models-dir", type=Path, default=Path(__file__).resolve().parents[1] / "models")
    args = p.parse_args()
    eval_onnx(args.models_dir, args.data)


if __name__ == "__main__":
    main()

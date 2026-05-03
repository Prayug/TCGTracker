#!/usr/bin/env python3
"""
Bootstrap the full ML pipeline:
  1) Optionally download HF PSA samples
  2) Synthesize + prepare crops
  3) Train corners/edges/surface (+ segmentation)
  4) Export ONNX + calibration + eval report

Run from card-scanner-backend:
  .venv/bin/python -m ml.bootstrap_train --epochs 6 --synthesize 500
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--epochs", type=int, default=6)
    p.add_argument("--synthesize", type=int, default=500)
    p.add_argument("--download", type=int, default=0, help="Max HF samples to download (0=skip)")
    p.add_argument("--seg-epochs", type=int, default=4)
    args = p.parse_args()

    data_raw = ROOT / "ml" / "data" / "raw" / "psa"
    crops = ROOT / "ml" / "data" / "crops"
    models_dir = ROOT / "models"
    models_dir.mkdir(parents=True, exist_ok=True)

    if args.download > 0:
        try:
            from ml.datasets.download_hf import download_pokemon_tcg_grading
            download_pokemon_tcg_grading(data_raw, args.download)
        except Exception as e:
            print(f"[bootstrap] HF download skipped: {e}")

    from ml.datasets.prepare_crops import prepare, synthesize_bootstrap

    synthesize_bootstrap(crops, args.synthesize)
    if data_raw.exists() and (data_raw / "manifest.json").exists():
        # Merge real PSA crops into same out dir
        prepare(data_raw, crops)

    from ml.train_axis import train_axis
    from ml.train_segmentation import train as train_seg
    from ml.export_onnx import export_axis, export_segmentation, export_calibration
    from ml.eval_report import eval_onnx

    maes = {}
    for axis in ("corners", "edges", "surface"):
        ckpt = models_dir / f"{axis}.pt"
        info = train_axis(axis, crops, ckpt, epochs=args.epochs, batch_size=32)
        maes[axis] = info.get("best_mae")
        export_axis(ckpt, models_dir / f"{axis}.onnx")

    seg_ckpt = models_dir / "segmentation.pt"
    train_seg(seg_ckpt, epochs=args.seg_epochs)
    export_segmentation(seg_ckpt, models_dir / "segmentation.onnx")
    export_calibration(models_dir, maes)

    report = eval_onnx(models_dir, crops)
    summary = {"maes": maes, "eval": report, "models_dir": str(models_dir)}
    (models_dir / "bootstrap_summary.json").write_text(json.dumps(summary, indent=2))
    print("Bootstrap complete.")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()

"""
Export trained .pt checkpoints to ONNX for Flask inference.

Usage:
  python -m ml.export_onnx --axis corners --checkpoint models/corners.pt --out models/corners.onnx
  python -m ml.export_onnx --all
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch
import torch.nn as nn


def load_axis_model(checkpoint: Path):
    from ml.train_axis import AxisRegressor

    model = AxisRegressor()
    state = torch.load(checkpoint, map_location="cpu", weights_only=False)
    model.load_state_dict(state["model"] if isinstance(state, dict) and "model" in state else state)
    model.eval()
    return model, state.get("val_mae") if isinstance(state, dict) else None


def load_seg_model(checkpoint: Path):
    from ml.train_segmentation import TinyUNet

    model = TinyUNet()
    state = torch.load(checkpoint, map_location="cpu", weights_only=False)
    model.load_state_dict(state["model"] if isinstance(state, dict) and "model" in state else state)
    model.eval()
    return model


class AxisExportWrapper(nn.Module):
    """Sigmoid → map to 1–10 score in a single output."""

    def __init__(self, backbone: nn.Module):
        super().__init__()
        self.backbone = backbone

    def forward(self, x):
        raw = torch.sigmoid(self.backbone(x))
        return raw * 9.0 + 1.0


def export_axis(checkpoint: Path, out: Path) -> dict:
    backbone, mae = load_axis_model(checkpoint)
    model = AxisExportWrapper(backbone)
    model.eval()
    dummy = torch.randn(1, 3, 224, 224)
    out.parent.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(
        model,
        dummy,
        str(out),
        input_names=["input"],
        output_names=["score"],
        opset_version=18,
        dynamo=False,
    )
    print(f"Exported {out} (val_mae={mae})")
    return {"out": str(out), "val_mae": mae}


def export_segmentation(checkpoint: Path, out: Path) -> dict:
    model = load_seg_model(checkpoint)
    dummy = torch.randn(1, 3, 256, 256)
    out.parent.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(
        model,
        dummy,
        str(out),
        input_names=["input"],
        output_names=["logits"],
        opset_version=18,
        dynamo=False,
    )
    print(f"Exported {out}")
    return {"out": str(out)}


def export_calibration(models_dir: Path, maes: dict[str, float | None]) -> None:
    """Simple identity calibration bins; refine after real PSA holdout eval."""
    bins = [{"x": float(i), "y": float(i)} for i in [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]]
    data = {"bins": bins, "global": bins, "maes": {k: v for k, v in maes.items() if v is not None}}
    path = models_dir / "calibration.json"
    path.write_text(json.dumps(data, indent=2))
    print(f"Wrote {path}")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--axis", choices=["corners", "edges", "surface", "segmentation"])
    p.add_argument("--checkpoint", type=Path)
    p.add_argument("--out", type=Path)
    p.add_argument("--all", action="store_true")
    p.add_argument("--models-dir", type=Path, default=Path(__file__).resolve().parents[1] / "models")
    args = p.parse_args()

    models_dir = args.models_dir
    if args.all:
        maes = {}
        for axis in ("corners", "edges", "surface"):
            ckpt = models_dir / f"{axis}.pt"
            if ckpt.exists():
                info = export_axis(ckpt, models_dir / f"{axis}.onnx")
                maes[axis] = info.get("val_mae")
        seg = models_dir / "segmentation.pt"
        if seg.exists():
            export_segmentation(seg, models_dir / "segmentation.onnx")
        export_calibration(models_dir, maes)
        return

    if not args.axis or not args.checkpoint:
        raise SystemExit("Provide --axis and --checkpoint, or --all")
    out = args.out or (models_dir / f"{args.axis}.onnx")
    if args.axis == "segmentation":
        export_segmentation(args.checkpoint, out)
    else:
        export_axis(args.checkpoint, out)


if __name__ == "__main__":
    main()

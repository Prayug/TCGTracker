"""
Train a MobileNetV3-small regression head for corners | edges | surface.

Usage:
  python -m ml.train_axis --axis corners --data ml/data/crops --epochs 8 --out models/corners.pt
"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

import cv2
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, Dataset
from torchvision import models, transforms


class CropDataset(Dataset):
    def __init__(self, root: Path, axis: str, items: list[dict], train: bool = True):
        self.root = root
        self.items = [x for x in items if x["axis"] == axis]
        self.train = train
        self.tf = transforms.Compose([
            transforms.ToPILImage(),
            transforms.Resize((224, 224)),
            transforms.ColorJitter(0.2, 0.2, 0.15, 0.05) if train else transforms.Lambda(lambda x: x),
            transforms.RandomHorizontalFlip() if train else transforms.Lambda(lambda x: x),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ])

    def __len__(self):
        return len(self.items)

    def __getitem__(self, idx):
        row = self.items[idx]
        path = self.root / row["file"]
        bgr = cv2.imread(str(path))
        if bgr is None:
            bgr = np.zeros((224, 224, 3), dtype=np.uint8)
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        # Mild blur / JPEG noise for phone domain gap
        if self.train and random.random() < 0.25:
            rgb = cv2.GaussianBlur(rgb, (3, 3), 0)
        x = self.tf(rgb)
        y = torch.tensor([(float(row["grade"]) - 1.0) / 9.0], dtype=torch.float32)
        return x, y


class AxisRegressor(nn.Module):
    def __init__(self):
        super().__init__()
        weights = None
        try:
            weights = models.MobileNet_V3_Small_Weights.DEFAULT
        except Exception:
            weights = None
        backbone = models.mobilenet_v3_small(weights=weights)
        in_features = backbone.classifier[-1].in_features
        backbone.classifier[-1] = nn.Linear(in_features, 1)
        self.net = backbone

    def forward(self, x):
        return self.net(x)


def train_axis(
    axis: str,
    data_dir: Path,
    out_path: Path,
    epochs: int = 8,
    batch_size: int = 32,
    lr: float = 1e-3,
) -> dict:
    index = json.loads((data_dir / "index.json").read_text())
    random.shuffle(index)
    split = int(len(index) * 0.85)
    train_items, val_items = index[:split], index[split:]

    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    if torch.cuda.is_available():
        device = torch.device("cuda")

    train_ds = CropDataset(data_dir, axis, train_items, train=True)
    val_ds = CropDataset(data_dir, axis, val_items, train=False)
    if len(train_ds) == 0:
        raise SystemExit(f"No crops for axis={axis}")

    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True, num_workers=0)
    val_loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False, num_workers=0)

    model = AxisRegressor().to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=lr)
    loss_fn = nn.MSELoss()

    best_mae = 999.0
    history = []
    for epoch in range(epochs):
        model.train()
        tr_loss = 0.0
        for xb, yb in train_loader:
            xb, yb = xb.to(device), yb.to(device)
            opt.zero_grad()
            pred = torch.sigmoid(model(xb))
            loss = loss_fn(pred, yb)
            loss.backward()
            opt.step()
            tr_loss += float(loss.item()) * len(xb)
        tr_loss /= max(1, len(train_ds))

        model.eval()
        mae = 0.0
        n = 0
        with torch.no_grad():
            for xb, yb in val_loader:
                xb, yb = xb.to(device), yb.to(device)
                pred = torch.sigmoid(model(xb))
                # Map back to 1-10
                pred_g = pred * 9.0 + 1.0
                true_g = yb * 9.0 + 1.0
                mae += float(torch.abs(pred_g - true_g).sum().item())
                n += len(xb)
        mae /= max(1, n)
        history.append({"epoch": epoch + 1, "train_loss": tr_loss, "val_mae": mae})
        print(f"[{axis}] epoch {epoch+1}/{epochs} loss={tr_loss:.4f} val_mae={mae:.3f}")
        if mae < best_mae:
            best_mae = mae
            out_path.parent.mkdir(parents=True, exist_ok=True)
            torch.save({"model": model.state_dict(), "axis": axis, "val_mae": mae}, out_path)

    return {"axis": axis, "best_mae": best_mae, "history": history, "checkpoint": str(out_path)}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--axis", choices=["corners", "edges", "surface"], required=True)
    p.add_argument("--data", type=Path, default=Path(__file__).parent / "data" / "crops")
    p.add_argument("--out", type=Path, default=None)
    p.add_argument("--epochs", type=int, default=8)
    p.add_argument("--batch-size", type=int, default=32)
    args = p.parse_args()
    out = args.out or (Path(__file__).resolve().parents[1] / "models" / f"{args.axis}.pt")
    result = train_axis(args.axis, args.data, out, args.epochs, args.batch_size)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()

"""
Train a lightweight U-Net-style segmentation model for card vs background.

For bootstrap we synthesize rectangles on random backgrounds and train briefly.
Export via export_onnx.py --axis segmentation.

Usage:
  python -m ml.train_segmentation --epochs 5 --out models/segmentation.pt
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, Dataset


class SynthSegDataset(Dataset):
    def __init__(self, n: int = 800, size: int = 256):
        self.n = n
        self.size = size
        self.rng = np.random.default_rng(0)

    def __len__(self):
        return self.n

    def __getitem__(self, idx):
        s = self.size
        rng = np.random.default_rng(idx + 7)
        bg = rng.integers(0, 255, size=(s, s, 3), dtype=np.uint8)
        # Sometimes solid bg
        if rng.random() < 0.5:
            bg[:] = rng.integers(0, 255, size=(3,), dtype=np.uint8)

        mask = np.zeros((s, s), dtype=np.float32)
        # Card rectangle with slight perspective jitter
        cw, ch = int(s * 0.45), int(s * 0.65)
        x0 = int(rng.integers(10, s - cw - 10))
        y0 = int(rng.integers(10, s - ch - 10))
        card = rng.integers(20, 220, size=(ch, cw, 3), dtype=np.uint8)
        # Border
        card[:8, :] = (40, 200, 230)
        card[-8:, :] = (40, 200, 230)
        card[:, :8] = (40, 200, 230)
        card[:, -8:] = (40, 200, 230)
        bg[y0 : y0 + ch, x0 : x0 + cw] = card
        mask[y0 : y0 + ch, x0 : x0 + cw] = 1.0

        if rng.random() < 0.3:
            bg = cv2.GaussianBlur(bg, (3, 3), 0)

        x = torch.from_numpy(bg.transpose(2, 0, 1)).float() / 255.0
        y = torch.from_numpy(mask[None, ...]).float()
        return x, y


class TinyUNet(nn.Module):
    def __init__(self):
        super().__init__()
        self.enc1 = nn.Sequential(nn.Conv2d(3, 16, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2))
        self.enc2 = nn.Sequential(nn.Conv2d(16, 32, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2))
        self.bottleneck = nn.Sequential(nn.Conv2d(32, 64, 3, padding=1), nn.ReLU())
        self.up1 = nn.ConvTranspose2d(64, 32, 2, stride=2)
        self.dec1 = nn.Sequential(nn.Conv2d(32, 32, 3, padding=1), nn.ReLU())
        self.up2 = nn.ConvTranspose2d(32, 16, 2, stride=2)
        self.dec2 = nn.Sequential(nn.Conv2d(16, 16, 3, padding=1), nn.ReLU())
        self.out = nn.Conv2d(16, 1, 1)

    def forward(self, x):
        e1 = self.enc1(x)
        e2 = self.enc2(e1)
        b = self.bottleneck(e2)
        d1 = self.dec1(self.up1(b))
        d2 = self.dec2(self.up2(d1))
        return self.out(d2)


def train(out_path: Path, epochs: int = 5, batch_size: int = 16) -> dict:
    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    if torch.cuda.is_available():
        device = torch.device("cuda")

    ds = SynthSegDataset(n=600)
    loader = DataLoader(ds, batch_size=batch_size, shuffle=True)
    model = TinyUNet().to(device)
    opt = torch.optim.Adam(model.parameters(), lr=1e-3)
    loss_fn = nn.BCEWithLogitsLoss()

    history = []
    for epoch in range(epochs):
        model.train()
        total = 0.0
        for xb, yb in loader:
            xb, yb = xb.to(device), yb.to(device)
            opt.zero_grad()
            pred = model(xb)
            loss = loss_fn(pred, yb)
            loss.backward()
            opt.step()
            total += float(loss.item()) * len(xb)
        avg = total / len(ds)
        history.append({"epoch": epoch + 1, "loss": avg})
        print(f"[segmentation] epoch {epoch+1}/{epochs} loss={avg:.4f}")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    torch.save({"model": model.state_dict(), "arch": "TinyUNet"}, out_path)
    return {"checkpoint": str(out_path), "history": history}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--epochs", type=int, default=5)
    p.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[1] / "models" / "segmentation.pt")
    args = p.parse_args()
    print(json.dumps(train(args.out, args.epochs), indent=2))


if __name__ == "__main__":
    main()

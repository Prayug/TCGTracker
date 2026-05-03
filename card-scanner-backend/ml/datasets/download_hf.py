"""
Download public PSA grading datasets from Hugging Face.

Primary: jyesr/pokemon-tcg-grading
Secondary: pacoalberola/Poke-Grader-Defect-Dataset-2000cards-v2

Usage:
  python -m ml.datasets.download_hf --max-samples 2000 --out ml/data/raw
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def download_pokemon_tcg_grading(out_dir: Path, max_samples: int | None = None) -> dict:
    try:
        from datasets import load_dataset
    except ImportError as e:
        raise SystemExit(
            "Install datasets: pip install datasets huggingface_hub"
        ) from e

    out_dir.mkdir(parents=True, exist_ok=True)
    candidates = [
        "pacoalberola/Poke-Grader-Dataset-Images-PSA",
        "jyesr/pokemon-tcg-grading",
        "lding101/pokemon-card-grades",
    ]
    ds = None
    used = None
    for name in candidates:
        try:
            print(f"Loading {name} (streaming, max={max_samples})…")
            ds = load_dataset(name, split="train", streaming=True)
            used = name
            break
        except Exception as e:
            print(f"  skip {name}: {e}")
            continue
    if ds is None:
        print("No PSA image dataset accessible — use --synthesize via prepare_crops instead.")
        return {"count": 0, "error": "no_dataset"}

    meta = []
    count = 0
    for row in ds:
        if max_samples is not None and count >= max_samples:
            break
        grade = row.get("grade") or row.get("psa_grade") or row.get("label")
        image = row.get("image") or row.get("front") or row.get("img")
        if image is None:
            continue
        side = "front"
        if "back" in str(row.get("side", "")).lower() or row.get("is_back"):
            side = "back"
        fname = f"{count:06d}_{side}_g{grade}.jpg"
        path = out_dir / fname
        try:
            if hasattr(image, "save"):
                image.convert("RGB").save(path, quality=92)
            else:
                continue
        except Exception as e:
            print(f"skip {count}: {e}")
            continue
        meta.append({"file": fname, "grade": grade, "side": side, "dataset": used})
        count += 1
        if count % 100 == 0:
            print(f"  saved {count}")

    (out_dir / "manifest.json").write_text(json.dumps(meta, indent=2))
    print(f"Done: {count} images from {used} → {out_dir}")
    return {"count": count, "out": str(out_dir), "dataset": used}


def download_defect_dataset(out_dir: Path, max_samples: int | None = 2000) -> dict:
    try:
        from datasets import load_dataset
    except ImportError as e:
        raise SystemExit("pip install datasets") from e

    out_dir.mkdir(parents=True, exist_ok=True)
    print("Loading pacoalberola/Poke-Grader-Defect-Dataset-2000cards-v2…")
    try:
        ds = load_dataset(
            "pacoalberola/Poke-Grader-Defect-Dataset-2000cards-v2",
            split="train",
            streaming=True,
        )
    except Exception as e:
        print(f"Defect dataset unavailable: {e}")
        return {"count": 0, "error": str(e)}

    meta = []
    count = 0
    for row in ds:
        if max_samples is not None and count >= max_samples:
            break
        image = row.get("image")
        label = row.get("label")
        if image is None:
            continue
        fname = f"defect_{count:06d}_l{label}.jpg"
        path = out_dir / fname
        try:
            image.convert("RGB").save(path, quality=92)
        except Exception:
            continue
        meta.append({"file": fname, "label": label})
        count += 1

    (out_dir / "defect_manifest.json").write_text(json.dumps(meta, indent=2))
    print(f"Defects: {count} → {out_dir}")
    return {"count": count}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[1] / "data" / "raw")
    p.add_argument("--max-samples", type=int, default=1500)
    p.add_argument("--skip-defects", action="store_true")
    args = p.parse_args()
    download_pokemon_tcg_grading(args.out / "psa", args.max_samples)
    if not args.skip_defects:
        download_defect_dataset(args.out / "defects", min(args.max_samples, 2000))


if __name__ == "__main__":
    main()

# Card grading ML

Specialist models for corners / edges / surface (+ optional segmentation).

## Quick bootstrap (synthetic + export ONNX)

```bash
cd card-scanner-backend
.venv/bin/python -m ml.bootstrap_train --epochs 6 --synthesize 500
```

Outputs land in `models/*.onnx` and are loaded by `model_inference.py` at runtime.

## Train on Hugging Face PSA data

```bash
.venv/bin/pip install datasets huggingface_hub torch torchvision
.venv/bin/python -m ml.datasets.download_hf --max-samples 2000
.venv/bin/python -m ml.datasets.prepare_crops --raw ml/data/raw/psa --out ml/data/crops --synthesize 200
.venv/bin/python -m ml.train_axis --axis corners --data ml/data/crops --epochs 12
.venv/bin/python -m ml.train_axis --axis edges --data ml/data/crops --epochs 12
.venv/bin/python -m ml.train_axis --axis surface --data ml/data/crops --epochs 12
.venv/bin/python -m ml.train_segmentation --epochs 6
.venv/bin/python -m ml.export_onnx --all
.venv/bin/python -m ml.eval_report
```

Datasets:
- https://huggingface.co/datasets/jyesr/pokemon-tcg-grading
- https://huggingface.co/datasets/pacoalberola/Poke-Grader-Defect-Dataset-2000cards-v2

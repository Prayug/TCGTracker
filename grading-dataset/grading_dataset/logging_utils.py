"""JSON-lines collection log."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from grading_dataset.db import utc_now


def setup_logging(log_path: Path) -> logging.Logger:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger("grading_dataset")
    logger.setLevel(logging.INFO)
    logger.handlers.clear()
    handler = logging.FileHandler(log_path, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(message)s"))
    stream = logging.StreamHandler()
    stream.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)
    logger.addHandler(stream)
    logger.propagate = False
    return logger


def log_event(logger: logging.Logger, **fields: Any) -> None:
    payload = {"timestamp": utc_now(), **fields}
    logger.info(json.dumps(payload, ensure_ascii=False, default=str))

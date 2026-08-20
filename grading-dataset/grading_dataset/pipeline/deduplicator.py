"""Exact, perceptual, and optional embedding duplicate detection.

Same certification number is always a duplicate regardless of source.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from pathlib import Path

import imagehash
from PIL import Image

from grading_dataset.schema import CardRecord


@dataclass
class DuplicateIndex:
    sha256: set[str] = field(default_factory=set)
    certs: set[str] = field(default_factory=set)
    phashes: list[tuple[str, str]] = field(default_factory=list)  # (phash, sample_id)
    phash_threshold: int = 3

    def observe_hash(self, digest: str) -> bool:
        if digest in self.sha256:
            return True
        self.sha256.add(digest)
        return False

    def observe_cert(self, company: str, cert: str) -> bool:
        cert = (cert or "").strip()
        if not cert:
            return False
        key = f"{company}:{cert}"
        if key in self.certs:
            return True
        self.certs.add(key)
        return False

    def observe_phash(self, phash: str, sample_id: str) -> str | None:
        current = imagehash.hex_to_hash(phash)
        for existing, other_id in self.phashes:
            if current - imagehash.hex_to_hash(existing) <= self.phash_threshold:
                return other_id
        self.phashes.append((phash, sample_id))
        return None


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def perceptual_hash(path: Path) -> str:
    with Image.open(path) as image:
        return str(imagehash.phash(image.convert("RGB")))


def check_duplicate(record: CardRecord, index: DuplicateIndex) -> str | None:
    if index.observe_cert(record.certification_company, record.cert_number):
        return f"duplicate_cert:{record.cert_number}"
    for digest in (record.sha256_front, record.sha256_back):
        if digest and index.observe_hash(digest):
            return f"duplicate_sha256:{digest[:12]}"
    if record.phash_front:
        hit = index.observe_phash(record.phash_front, record.sample_id)
        if hit:
            return f"duplicate_phash:{hit}"
    return None


def cosine_similar(a: list[float], b: list[float], threshold: float = 0.985) -> bool:
    """Optional embedding match. Caller supplies CLIP/DINO vectors."""
    if not a or not b or len(a) != len(b):
        return False
    import math

    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return False
    return (dot / (na * nb)) >= threshold

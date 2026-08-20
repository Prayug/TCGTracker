#!/usr/bin/env python3
"""Phase 1: refresh source catalog outputs. Does not download card images."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from grading_dataset.catalog import collection_enabled_sources
from grading_dataset.report import write_outputs


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--refresh-robots",
        action="store_true",
        help="Re-fetch robots.txt for catalogued HTTP sources (not HTML content).",
    )
    args = parser.parse_args()
    written = write_outputs(ROOT, refresh_robots=args.refresh_robots)
    enabled = collection_enabled_sources()
    print("Wrote:")
    for name, path in written.items():
        print(f"  {name}: {path}")
    print(f"Sources currently collection_allowed: {len(enabled)}")
    if not enabled:
        print("Phase 1 complete: no bulk collection will run.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

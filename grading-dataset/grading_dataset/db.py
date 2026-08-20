"""Resumable SQLite store for records, downloads, sources, and errors."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

SCHEMA = """
CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    collection_allowed INTEGER NOT NULL,
    recommendation TEXT NOT NULL,
    scraping_permission TEXT NOT NULL,
    license TEXT,
    paused INTEGER NOT NULL DEFAULT 0,
    pause_reason TEXT,
    payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS records (
    sample_id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    cert_number TEXT,
    physical_key TEXT NOT NULL,
    grade INTEGER,
    grade_label_confidence TEXT,
    validation_status TEXT NOT NULL,
    capture_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_records_physical ON records(physical_key);
CREATE INDEX IF NOT EXISTS idx_records_grade ON records(grade);
CREATE INDEX IF NOT EXISTS idx_records_source ON records(source);

CREATE TABLE IF NOT EXISTS downloads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sample_id TEXT NOT NULL,
    url TEXT NOT NULL,
    local_path TEXT,
    http_status INTEGER,
    sha256 TEXT,
    completed INTEGER NOT NULL DEFAULT 0,
    retrieved_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_downloads_url ON downloads(url);

CREATE TABLE IF NOT EXISTS errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    source TEXT,
    url TEXT,
    http_status INTEGER,
    message TEXT NOT NULL,
    payload_json TEXT
);

CREATE TABLE IF NOT EXISTS qa_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sample_id TEXT NOT NULL,
    source TEXT NOT NULL,
    decision TEXT NOT NULL,
    notes TEXT,
    reviewed_at TEXT NOT NULL
);
"""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class PipelineDB:
    def __init__(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        self.conn = sqlite3.connect(str(path))
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.executescript(SCHEMA)
        self.conn.commit()

    def close(self) -> None:
        self.conn.close()

    def upsert_source(self, payload: dict[str, Any]) -> None:
        self.conn.execute(
            """
            INSERT INTO sources (id, name, url, collection_allowed, recommendation,
                                 scraping_permission, license, paused, pause_reason, payload_json)
            VALUES (:id, :name, :url, :collection_allowed, :recommendation,
                    :scraping_permission, :license, 0, NULL, :payload_json)
            ON CONFLICT(id) DO UPDATE SET
                name=excluded.name,
                url=excluded.url,
                collection_allowed=excluded.collection_allowed,
                recommendation=excluded.recommendation,
                scraping_permission=excluded.scraping_permission,
                license=excluded.license,
                payload_json=excluded.payload_json
            """,
            {
                "id": payload["id"],
                "name": payload["name"],
                "url": payload["url"],
                "collection_allowed": int(payload["collection_allowed"]),
                "recommendation": payload["recommendation"],
                "scraping_permission": payload["scraping_permission"],
                "license": payload.get("license"),
                "payload_json": json.dumps(payload, ensure_ascii=False),
            },
        )
        self.conn.commit()

    def pause_source(self, source_id: str, reason: str) -> None:
        self.conn.execute(
            "UPDATE sources SET paused=1, pause_reason=? WHERE id=?",
            (reason, source_id),
        )
        self.conn.commit()

    def source_paused(self, source_id: str) -> bool:
        row = self.conn.execute(
            "SELECT paused FROM sources WHERE id=?", (source_id,)
        ).fetchone()
        return bool(row and row["paused"])

    def record_exists(self, sample_id: str) -> bool:
        row = self.conn.execute(
            "SELECT 1 FROM records WHERE sample_id=?", (sample_id,)
        ).fetchone()
        return row is not None

    def physical_exists(self, physical_key: str) -> bool:
        row = self.conn.execute(
            "SELECT 1 FROM records WHERE physical_key=?", (physical_key,)
        ).fetchone()
        return row is not None

    def download_complete(self, url: str) -> bool:
        row = self.conn.execute(
            "SELECT completed FROM downloads WHERE url=?", (url,)
        ).fetchone()
        return bool(row and row["completed"])

    def upsert_record(self, sample_id: str, source: str, payload: dict[str, Any]) -> None:
        now = utc_now()
        self.conn.execute(
            """
            INSERT INTO records (sample_id, source, cert_number, physical_key, grade,
                                 grade_label_confidence, validation_status, capture_type,
                                 payload_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(sample_id) DO UPDATE SET
                source=excluded.source,
                cert_number=excluded.cert_number,
                physical_key=excluded.physical_key,
                grade=excluded.grade,
                grade_label_confidence=excluded.grade_label_confidence,
                validation_status=excluded.validation_status,
                capture_type=excluded.capture_type,
                payload_json=excluded.payload_json,
                updated_at=excluded.updated_at
            """,
            (
                sample_id,
                source,
                payload.get("cert_number"),
                payload.get("physical_key") or f"sample:{sample_id}",
                payload.get("grade"),
                payload.get("grade_label_confidence"),
                payload.get("validation_status", "pending"),
                payload.get("capture_type", "slab"),
                json.dumps(payload, ensure_ascii=False),
                now,
                now,
            ),
        )
        self.conn.commit()

    def mark_download(
        self,
        sample_id: str,
        url: str,
        *,
        local_path: str | None,
        http_status: int | None,
        sha256: str | None,
        completed: bool,
    ) -> None:
        self.conn.execute(
            """
            INSERT INTO downloads (sample_id, url, local_path, http_status, sha256, completed, retrieved_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(url) DO UPDATE SET
                sample_id=excluded.sample_id,
                local_path=excluded.local_path,
                http_status=excluded.http_status,
                sha256=excluded.sha256,
                completed=excluded.completed,
                retrieved_at=excluded.retrieved_at
            """,
            (
                sample_id,
                url,
                local_path,
                http_status,
                sha256,
                int(completed),
                utc_now(),
            ),
        )
        self.conn.commit()

    def log_error(
        self,
        message: str,
        *,
        source: str | None = None,
        url: str | None = None,
        http_status: int | None = None,
        payload: dict[str, Any] | None = None,
    ) -> None:
        self.conn.execute(
            """
            INSERT INTO errors (ts, source, url, http_status, message, payload_json)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                utc_now(),
                source,
                url,
                http_status,
                message,
                json.dumps(payload or {}, ensure_ascii=False),
            ),
        )
        self.conn.commit()

    def add_qa(self, sample_id: str, source: str, decision: str, notes: str = "") -> None:
        self.conn.execute(
            """
            INSERT INTO qa_reviews (sample_id, source, decision, notes, reviewed_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (sample_id, source, decision, notes, utc_now()),
        )
        self.conn.commit()

    def iter_records(self) -> Iterable[dict[str, Any]]:
        rows = self.conn.execute("SELECT payload_json FROM records").fetchall()
        for row in rows:
            yield json.loads(row["payload_json"])

    def count_accepted_by_grade(self) -> dict[int, int]:
        rows = self.conn.execute(
            """
            SELECT grade, COUNT(*) AS n
            FROM records
            WHERE validation_status='accepted' AND grade IS NOT NULL
            GROUP BY grade
            """
        ).fetchall()
        return {int(r["grade"]): int(r["n"]) for r in rows}

    def source_qa_error_rate(self, source_id: str) -> float | None:
        row = self.conn.execute(
            """
            SELECT
              SUM(CASE WHEN decision != 'ACCEPT' THEN 1 ELSE 0 END) AS bad,
              COUNT(*) AS total
            FROM qa_reviews
            WHERE source=?
            """,
            (source_id,),
        ).fetchone()
        if not row or not row["total"]:
            return None
        return float(row["bad"]) / float(row["total"])

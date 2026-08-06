#!/usr/bin/env python3
"""
Database Optimization Script — SAFEGUARDED.

Previously this truncated price_history to 30 days, which destroys data needed
for 90d/180d/365d predictions, forward tests, and backtests.

Safe defaults:
  - Refuse to delete price history younger than MIN_KEEP_DAYS (400)
  - Require --i-understand-this-deletes-history and an explicit --keep-days
  - Prefer VACUUM-only mode for reclaiming free pages without data loss
"""

import argparse
import os
import sqlite3
import sys
from datetime import datetime, timedelta

DB_PATH = os.environ.get('DATABASE_PATH', 'tcg-prices.db')
MIN_KEEP_DAYS = 400


def vacuum_only(conn: sqlite3.Connection) -> None:
    original_size = os.path.getsize(DB_PATH) / (1024 * 1024)
    print(f"📊 Database size before VACUUM: {original_size:.2f} MB")
    print("🧹 Running VACUUM (no data deleted)...")
    conn.execute("VACUUM")
    conn.commit()
    new_size = os.path.getsize(DB_PATH) / (1024 * 1024)
    print(f"✨ VACUUM complete. New size: {new_size:.2f} MB")


def prune_price_history(conn: sqlite3.Connection, keep_days: int) -> None:
    if keep_days < MIN_KEEP_DAYS:
        print(
            f"❌ Refusing to keep only {keep_days} days. "
            f"Minimum is {MIN_KEEP_DAYS} (needed for long-horizon models)."
        )
        sys.exit(1)

    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*), MIN(date), MAX(date) FROM price_history")
    original_rows, min_date, max_date = cursor.fetchone()
    print(f"📋 price_history rows: {original_rows:,}  span: {min_date} → {max_date}")

    cutoff_date = (datetime.now() - timedelta(days=keep_days)).strftime('%Y-%m-%d')
    print(f"🗓️  Deleting price_history older than {cutoff_date} (keeping {keep_days}d)")

    cursor.execute("DELETE FROM price_history WHERE date < ?", (cutoff_date,))
    deleted = cursor.rowcount
    try:
        cursor.execute("DELETE FROM canonical_price_history WHERE date < ?", (cutoff_date,))
    except sqlite3.OperationalError:
        pass
    conn.commit()
    print(f"✅ Deleted {deleted:,} price_history rows")
    vacuum_only(conn)


def main() -> None:
    parser = argparse.ArgumentParser(
        description='Safely optimize the TCGTracker SQLite database'
    )
    parser.add_argument(
        '--vacuum-only',
        action='store_true',
        help='Reclaim free pages without deleting any rows (recommended)',
    )
    parser.add_argument(
        '--keep-days',
        type=int,
        default=None,
        help=f'Delete price_history older than N days (minimum {MIN_KEEP_DAYS})',
    )
    parser.add_argument(
        '--i-understand-this-deletes-history',
        action='store_true',
        help='Required confirmation flag when using --keep-days',
    )
    args = parser.parse_args()

    if not os.path.exists(DB_PATH):
        print(f"❌ Database not found: {DB_PATH}")
        sys.exit(1)

    print("🔧 TCG Price Tracker - Database Optimization (safeguarded)\n")

    if args.keep_days is not None:
        if not args.i_understand_this_deletes_history:
            print(
                "❌ Refusing destructive prune. Pass "
                "--i-understand-this-deletes-history along with --keep-days."
            )
            print("   Prefer: python optimize_database.py --vacuum-only")
            sys.exit(1)
        conn = sqlite3.connect(DB_PATH)
        try:
            prune_price_history(conn, args.keep_days)
        finally:
            conn.close()
        return

    # Default / --vacuum-only: never delete history
    if not args.vacuum_only:
        print("ℹ️  No destructive flags given — running VACUUM only.")
        print("   (Old 30-day truncate behavior is disabled permanently.)\n")

    conn = sqlite3.connect(DB_PATH)
    try:
        vacuum_only(conn)
    finally:
        conn.close()


if __name__ == '__main__':
    main()

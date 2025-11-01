#!/usr/bin/env python3
"""
Database Optimization Script
Reduces database size by:
1. Keeping only recent price history (last 30 days)
2. Vacuuming the database to reclaim space
"""

import sqlite3
import os
from datetime import datetime, timedelta

DB_PATH = 'tcg-prices.db'
DAYS_TO_KEEP = 30  # Keep last 30 days of price history

def optimize_database():
    if not os.path.exists(DB_PATH):
        print(f"❌ Database not found: {DB_PATH}")
        return
    
    # Get original size
    original_size = os.path.getsize(DB_PATH) / (1024 * 1024)  # MB
    print(f"📊 Original database size: {original_size:.2f} MB")
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Get row counts before
    cursor.execute("SELECT COUNT(*) FROM price_history")
    original_rows = cursor.fetchone()[0]
    print(f"📋 Original row count: {original_rows:,}")
    
    # Calculate cutoff date
    cutoff_date = (datetime.now() - timedelta(days=DAYS_TO_KEEP)).strftime('%Y-%m-%d')
    print(f"🗓️  Keeping data from: {cutoff_date} onwards")
    
    # Delete old data
    print("🗑️  Deleting old price history...")
    cursor.execute("DELETE FROM price_history WHERE date < ?", (cutoff_date,))
    deleted_rows = cursor.rowcount
    conn.commit()
    print(f"✅ Deleted {deleted_rows:,} old rows")
    
    # Get row counts after
    cursor.execute("SELECT COUNT(*) FROM price_history")
    remaining_rows = cursor.fetchone()[0]
    print(f"📋 Remaining rows: {remaining_rows:,}")
    
    # Vacuum to reclaim space
    print("🧹 Vacuuming database to reclaim space...")
    cursor.execute("VACUUM")
    conn.commit()
    
    conn.close()
    
    # Get new size
    new_size = os.path.getsize(DB_PATH) / (1024 * 1024)  # MB
    saved = original_size - new_size
    percentage = (saved / original_size) * 100
    
    print(f"\n✨ Optimization complete!")
    print(f"📊 New database size: {new_size:.2f} MB")
    print(f"💾 Space saved: {saved:.2f} MB ({percentage:.1f}%)")
    print(f"✅ Rows removed: {deleted_rows:,} ({(deleted_rows/original_rows)*100:.1f}%)")

if __name__ == '__main__':
    print("🔧 TCG Price Tracker - Database Optimization\n")
    print("⚠️  This will delete price history older than 30 days.")
    response = input("Continue? (y/n): ")
    
    if response.lower() == 'y':
        optimize_database()
    else:
        print("❌ Optimization cancelled")


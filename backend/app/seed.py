"""
Database seed script for Resolve OS.
Reads data from /data JSON files and initializes SQLite tables.
Resets the demo state to original hero scenarios.
"""
import os
import json
from pathlib import Path
from .db import get_db, init_db, now_iso

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"

def seed_database():
    init_db()
    conn = get_db()
    cur = conn.cursor()

    # Clear all existing tables
    tables = [
        "audit_events",
        "whatsapp_messages",
        "human_briefs",
        "cognee_sync_log",
        "refunds",
        "transactions",
        "settlements",
        "devices",
        "tickets",
        "merchants"
    ]
    for table in tables:
        cur.execute(f"DELETE FROM {table};")

    # 1. Seed merchants
    with open(DATA_DIR / "merchants.json", "r") as f:
        merchants = json.load(f)
    for m in merchants:
        cur.execute("""
            INSERT INTO merchants (id, name, city, category, qr_status, soundbox_status, avg_gmv, preferred_lang, risk_flag, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (m["id"], m["name"], m["city"], m["category"], m["qr_status"], m["soundbox_status"], m["avg_gmv"], m["preferred_lang"], m.get("risk_flag"), now_iso()))

    # 2. Seed tickets
    with open(DATA_DIR / "tickets.json", "r") as f:
        tickets = json.load(f)
    for t in tickets:
        cur.execute("""
            INSERT INTO tickets (id, merchant_id, text, channel, status, amount, intent, priority, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (t["id"], t["merchant_id"], t["text"], t["channel"], t["status"], t["amount"], t["intent"], t["priority"], t["created_at"]))

    # 3. Seed settlements
    with open(DATA_DIR / "settlements.json", "r") as f:
        settlements = json.load(f)
    for s in settlements:
        cur.execute("""
            INSERT INTO settlements (id, merchant_id, ticket_id, amount, status, reason, utr, retry_count, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (s["id"], s["merchant_id"], s.get("ticket_id"), s["amount"], s["status"], s.get("reason"), s.get("utr"), s.get("retry_count", 0), s["created_at"]))

    # 4. Seed transactions
    with open(DATA_DIR / "transactions.json", "r") as f:
        transactions = json.load(f)
    for tx in transactions:
        cur.execute("""
            INSERT INTO transactions (id, merchant_id, ticket_id, amount, status, utr, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (tx["id"], tx["merchant_id"], tx.get("ticket_id"), tx["amount"], tx["status"], tx.get("utr"), tx["created_at"]))

    # 5. Seed devices
    devices = [
        ("dev_01", "m_2041", "SOUNDBOX", "ONLINE"),
        ("dev_02", "m_2048", "SOUNDBOX", "ONLINE"),
        ("dev_03", "m_2099", "SOUNDBOX", "ONLINE"),
        ("dev_04", "m_2104", "SOUNDBOX", "OFFLINE"),
        ("dev_05", "m_2115", "SOUNDBOX", "ONLINE")
    ]
    for d in devices:
        cur.execute("""
            INSERT INTO devices (id, merchant_id, type, status)
            VALUES (?, ?, ?, ?)
        """, d)

    # 6. Initialize Cognee knowledge sync log
    cur.execute("""
        INSERT INTO cognee_sync_log (merchant_id, action, query, hit_count, payload_json, created_at)
        VALUES (?, 'ADD', 'Ingest 5 merchant profiles, settlements, and SOPs into graph memory', 5, ?, ?)
    """, ("SYSTEM", json.dumps({"status": "seeded", "merchants_count": len(merchants)}), now_iso()))

    conn.commit()
    conn.close()
    print("Database successfully seeded with Paytm test data.")

if __name__ == "__main__":
    seed_database()

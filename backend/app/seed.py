"""
Database seed script for Resolve OS.
Reads data from /data JSON files and initializes SQLite or Supabase PostgreSQL tables.
Generates dynamic relative timestamps so demo tickets are fresh and realistic.
"""
import os
import json
from pathlib import Path
from datetime import datetime, timezone, timedelta
from .db import get_db, init_db, now_iso, is_postgres

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"

def relative_iso(minutes_ago: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)).isoformat()

def seed_database(seed_hero_tickets: bool = True):
    init_db()
    conn = get_db()
    cur = conn.cursor()

    # Clear all existing tables in reverse dependency order
    tables = [
        "audit_events",
        "whatsapp_messages",
        "processed_messages",
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
    conn.commit()

    # 1. Seed merchants
    with open(DATA_DIR / "merchants.json", "r") as f:
        merchants = json.load(f)
    for m in merchants:
        cur.execute("""
            INSERT INTO merchants (id, phone, name, city, category, qr_status, soundbox_status, avg_gmv, preferred_lang, risk_flag, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET
                phone = EXCLUDED.phone,
                name = EXCLUDED.name,
                city = EXCLUDED.city,
                category = EXCLUDED.category,
                qr_status = EXCLUDED.qr_status,
                soundbox_status = EXCLUDED.soundbox_status,
                avg_gmv = EXCLUDED.avg_gmv,
                preferred_lang = EXCLUDED.preferred_lang,
                risk_flag = EXCLUDED.risk_flag
        """, (m["id"], m.get("phone"), m["name"], m["city"], m["category"], m["qr_status"], m["soundbox_status"], m["avg_gmv"], m["preferred_lang"], m.get("risk_flag"), now_iso()))

    # Primary merchant row for WhatsApp sandbox testing (Sparsh)
    # Default phone is seeded, but dynamically updated when incoming webhook is received
    cur.execute("""
        INSERT INTO merchants (id, phone, name, city, category, qr_status, soundbox_status, avg_gmv, preferred_lang, risk_flag, created_at)
        VALUES ('m_me', '919810012345', 'Sparsh', 'Delhi NCR', 'Merchant Partner', 'LIVE', 'ONLINE', 25000.0, 'hi-en', NULL, ?)
        ON CONFLICT (id) DO UPDATE SET
            phone = EXCLUDED.phone,
            name = EXCLUDED.name
    """, (now_iso(),))

    # 2. Seed tickets (with fresh relative timestamps)
    if seed_hero_tickets:
        with open(DATA_DIR / "tickets.json", "r") as f:
            tickets = json.load(f)
        minute_offsets = [120, 60, 25, 10, 3]
        for idx, t in enumerate(tickets):
            t_time = relative_iso(minute_offsets[idx % len(minute_offsets)])
            cur.execute("""
                INSERT INTO tickets (id, merchant_id, text, channel, status, amount, intent, priority, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (id) DO UPDATE SET
                    status = EXCLUDED.status,
                    amount = EXCLUDED.amount,
                    intent = EXCLUDED.intent,
                    created_at = EXCLUDED.created_at
            """, (t["id"], t["merchant_id"], t["text"], t["channel"], t["status"], t["amount"], t["intent"], t["priority"], t_time))

    # 3. Seed settlements
    with open(DATA_DIR / "settlements.json", "r") as f:
        settlements = json.load(f)
    for idx, s in enumerate(settlements):
        s_time = relative_iso(180 - idx * 30)
        cur.execute("""
            INSERT INTO settlements (id, merchant_id, ticket_id, amount, status, reason, utr, retry_count, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET
                amount = EXCLUDED.amount,
                status = EXCLUDED.status,
                reason = EXCLUDED.reason,
                utr = EXCLUDED.utr,
                retry_count = EXCLUDED.retry_count
        """, (s["id"], s["merchant_id"], s.get("ticket_id"), s["amount"], s["status"], s.get("reason"), s.get("utr"), s.get("retry_count", 0), s_time))

    # Standard test ledger rows for m_me:
    # 1. Pending batch ₹12,000 INITIATED (for retry matching)
    # 2. Completed batch ₹14,280 SUCCESS (for already-settled check)
    cur.execute("""
        INSERT INTO settlements (id, merchant_id, ticket_id, amount, status, reason, utr, retry_count, created_at)
        VALUES ('stl_me_01', 'm_me', NULL, 12000.0, 'INITIATED', 'BANK_FILE_PENDING', NULL, 0, ?)
        ON CONFLICT (id) DO UPDATE SET
            amount = 12000.0,
            status = 'INITIATED',
            reason = 'BANK_FILE_PENDING',
            utr = NULL,
            retry_count = 0
    """, (relative_iso(90),))
    cur.execute("""
        INSERT INTO settlements (id, merchant_id, ticket_id, amount, status, reason, utr, retry_count, created_at)
        VALUES ('stl_me_02', 'm_me', NULL, 14280.0, 'SUCCESS', 'SETTLED_TO_BANK', 'PAYTM1928374650', 1, ?)
        ON CONFLICT (id) DO UPDATE SET
            amount = 14280.0,
            status = 'SUCCESS',
            reason = 'SETTLED_TO_BANK',
            utr = 'PAYTM1928374650',
            retry_count = 1
    """, (relative_iso(240),))

    # 4. Seed transactions
    with open(DATA_DIR / "transactions.json", "r") as f:
        transactions = json.load(f)
    for idx, tx in enumerate(transactions):
        tx_time = relative_iso(120 - idx * 20)
        cur.execute("""
            INSERT INTO transactions (id, merchant_id, ticket_id, amount, status, utr, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET
                amount = EXCLUDED.amount,
                status = EXCLUDED.status,
                utr = EXCLUDED.utr
        """, (tx["id"], tx["merchant_id"], tx.get("ticket_id"), tx["amount"], tx["status"], tx.get("utr"), tx_time))

    # Test transactions for m_me (for refund testing)
    cur.execute("""
        INSERT INTO transactions (id, merchant_id, ticket_id, amount, status, utr, created_at)
        VALUES ('tx_me_01', 'm_me', NULL, 850.0, 'SUCCESS', 'PAYTM1092837465', ?)
        ON CONFLICT (id) DO NOTHING
    """, (relative_iso(150),))
    cur.execute("""
        INSERT INTO transactions (id, merchant_id, ticket_id, amount, status, utr, created_at)
        VALUES ('tx_me_02', 'm_me', NULL, 850.0, 'SUCCESS', 'PAYTM8472910384', ?)
        ON CONFLICT (id) DO NOTHING
    """, (relative_iso(140),))

    # 5. Seed devices
    devices = [
        ("dev_01", "m_2041", "SOUNDBOX", "ONLINE"),
        ("dev_02", "m_2048", "SOUNDBOX", "ONLINE"),
        ("dev_03", "m_2099", "SOUNDBOX", "ONLINE"),
        ("dev_04", "m_2104", "SOUNDBOX", "OFFLINE"),
        ("dev_05", "m_2115", "SOUNDBOX", "ONLINE"),
        ("dev_me", "m_me", "SOUNDBOX", "ONLINE")
    ]
    for d in devices:
        cur.execute("""
            INSERT INTO devices (id, merchant_id, type, status)
            VALUES (?, ?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET
                status = EXCLUDED.status
        """, d)

    # 6. Initialize Cognee knowledge sync log
    cur.execute("""
        INSERT INTO cognee_sync_log (merchant_id, action, query, hit_count, payload_json, created_at)
        VALUES (?, 'ADD', 'Ingest 5 merchant profiles, settlements, and SOPs into graph memory', 5, ?, ?)
    """, ("SYSTEM", json.dumps({"status": "seeded", "merchants_count": len(merchants) + 1}), now_iso()))

    conn.commit()
    conn.close()
    print("Database successfully seeded with Paytm test data.")

if __name__ == "__main__":
    seed_database()

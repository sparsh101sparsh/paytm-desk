"""
SQLite database engine for Resolve OS.
Follows ponytail principles: clean stdlib sqlite3, zero ORM bloat, explicit schema.
Source of truth for all ticket state, settlements, audit events, and WhatsApp outbox.
"""
import sqlite3
import os
import json
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = os.getenv("RESOLVEOS_DB_PATH", os.getenv("Resolve OS_DB_PATH", str(Path(__file__).resolve().parent.parent / "desk.db")))

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def init_db(conn=None):
    close_at_end = False
    if conn is None:
        conn = get_db()
        close_at_end = True

    cur = conn.cursor()
    cur.executescript("""
    CREATE TABLE IF NOT EXISTS merchants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        city TEXT NOT NULL,
        category TEXT NOT NULL,
        qr_status TEXT NOT NULL DEFAULT 'LIVE',
        soundbox_status TEXT NOT NULL DEFAULT 'ONLINE',
        avg_gmv REAL NOT NULL DEFAULT 0.0,
        preferred_lang TEXT NOT NULL DEFAULT 'hi-en',
        risk_flag TEXT DEFAULT NULL,
        created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tickets (
        id TEXT PRIMARY KEY,
        merchant_id TEXT NOT NULL,
        text TEXT NOT NULL,
        channel TEXT NOT NULL DEFAULT 'WhatsApp',
        status TEXT NOT NULL DEFAULT 'OPEN', -- OPEN, IN_PROGRESS, WAITING_ON_MERCHANT, RESOLVED, ESCALATED
        amount REAL,
        intent TEXT,
        priority TEXT NOT NULL DEFAULT 'HIGH',
        n8n_execution_id TEXT DEFAULT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (merchant_id) REFERENCES merchants(id)
    );

    CREATE TABLE IF NOT EXISTS settlements (
        id TEXT PRIMARY KEY,
        merchant_id TEXT NOT NULL,
        ticket_id TEXT,
        amount REAL NOT NULL,
        status TEXT NOT NULL, -- INITIATED, SUCCESS, FAILED
        reason TEXT,
        utr TEXT,
        retry_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (merchant_id) REFERENCES merchants(id)
    );

    CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        merchant_id TEXT NOT NULL,
        ticket_id TEXT,
        amount REAL NOT NULL,
        status TEXT NOT NULL, -- SUCCESS, FAILED
        utr TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (merchant_id) REFERENCES merchants(id)
    );

    CREATE TABLE IF NOT EXISTS refunds (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL,
        transaction_id TEXT,
        amount REAL NOT NULL,
        status TEXT NOT NULL, -- PENDING, PROCESSED, REJECTED
        created_at TEXT NOT NULL,
        FOREIGN KEY (ticket_id) REFERENCES tickets(id)
    );

    CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        merchant_id TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        FOREIGN KEY (merchant_id) REFERENCES merchants(id)
    );

    CREATE TABLE IF NOT EXISTS whatsapp_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id TEXT NOT NULL,
        template_id TEXT NOT NULL,
        body TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'sent', -- queued, sent, failed
        created_at TEXT NOT NULL,
        FOREIGN KEY (ticket_id) REFERENCES tickets(id)
    );

    CREATE TABLE IF NOT EXISTS human_briefs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id TEXT NOT NULL,
        queue TEXT NOT NULL DEFAULT 'RISK_OPS',
        merchant_name TEXT NOT NULL,
        amount REAL,
        checks TEXT,
        not_done TEXT,
        recommendation TEXT,
        brief_text TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (ticket_id) REFERENCES tickets(id)
    );

    CREATE TABLE IF NOT EXISTS audit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id TEXT NOT NULL,
        ts TEXT NOT NULL,
        actor TEXT NOT NULL, -- SARVAM, COGNEE, POLICY, N8N, FIXTURE
        type TEXT NOT NULL,  -- UNDERSTOOD, RECALLED, DECIDED, ACTED, NOTIFIED
        payload_json TEXT NOT NULL,
        reason_code TEXT,
        policy_token TEXT,
        latency_ms INTEGER DEFAULT 0,
        FOREIGN KEY (ticket_id) REFERENCES tickets(id)
    );

    CREATE TABLE IF NOT EXISTS cognee_sync_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        merchant_id TEXT NOT NULL,
        action TEXT NOT NULL, -- ADD, SEARCH, REMEMBER
        query TEXT,
        hit_count INTEGER DEFAULT 0,
        payload_json TEXT,
        created_at TEXT NOT NULL
    );
    """)
    conn.commit()
    if close_at_end:
        conn.close()

def now_iso():
    return datetime.now(timezone.utc).isoformat()

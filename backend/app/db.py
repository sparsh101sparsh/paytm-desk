"""
Database engine for Resolve OS.
Supports both Supabase PostgreSQL (production persistent single source of truth)
and standard SQLite (local development and pytest test runner).
Source of truth for all ticket state, settlements, audit events, and WhatsApp outbox.
"""
import sqlite3
import os
import re
from datetime import datetime, timezone
from pathlib import Path

DATABASE_URL = os.getenv("DATABASE_URL", "")
DB_PATH = os.getenv("RESOLVEOS_DB_PATH", str(Path(__file__).resolve().parent.parent / "desk.db"))

def is_postgres() -> bool:
    url = os.getenv("DATABASE_URL", "")
    return bool(url and url.startswith(("postgres://", "postgresql://")))

class PostgresCursorWrapper:
    def __init__(self, cur):
        self._cur = cur
        self._lastrowid = None

    def execute(self, query, params=None):
        clean_q = query.strip()
        # No-op PRAGMAs for postgres
        if clean_q.upper().startswith("PRAGMA"):
            return self

        # If query is INSERT into a table with serial id, and doesn't have RETURNING
        is_insert = clean_q.upper().startswith("INSERT INTO")
        has_returning = "RETURNING" in clean_q.upper()

        if "?" in clean_q:
            clean_q = clean_q.replace("?", "%s")

        if is_insert and not has_returning and any(tbl in clean_q for tbl in ["audit_events", "whatsapp_messages", "human_briefs", "cognee_sync_log"]):
            clean_q += " RETURNING id"
            if params is not None:
                self._cur.execute(clean_q, params)
            else:
                self._cur.execute(clean_q)
            res = self._cur.fetchone()
            if res:
                self._lastrowid = res.get("id") if isinstance(res, dict) else res[0]
            return self

        if params is not None:
            self._cur.execute(clean_q, params)
        else:
            self._cur.execute(clean_q)
        return self

    def executescript(self, script):
        for stmt in script.split(";"):
            s = stmt.strip()
            if s and not s.upper().startswith("PRAGMA"):
                self.execute(s)
        return self

    @property
    def lastrowid(self):
        return self._lastrowid

    def fetchone(self):
        return self._cur.fetchone()

    def fetchall(self):
        return self._cur.fetchall()

    def __iter__(self):
        return iter(self._cur)

    def __getattr__(self, name):
        return getattr(self._cur, name)

class PostgresConnectionWrapper:
    def __init__(self, raw_conn):
        self._conn = raw_conn

    def cursor(self):
        return PostgresCursorWrapper(self._conn.cursor())

    def execute(self, query, params=None):
        cur = self.cursor()
        cur.execute(query, params)
        return cur

    def commit(self):
        return self._conn.commit()

    def rollback(self):
        return self._conn.rollback()

    def close(self):
        return self._conn.close()

    def __getattr__(self, name):
        return getattr(self._conn, name)

def get_db():
    if is_postgres():
        import psycopg
        from psycopg.rows import dict_row
        url = os.getenv("DATABASE_URL")
        raw_conn = psycopg.connect(url, row_factory=dict_row)
        return PostgresConnectionWrapper(raw_conn)

    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA busy_timeout = 30000;")
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def init_db(conn=None):
    close_at_end = False
    if conn is None:
        conn = get_db()
        close_at_end = True

    cur = conn.cursor()

    if is_postgres():
        cur.execute("""
        CREATE TABLE IF NOT EXISTS merchants (
            id TEXT PRIMARY KEY,
            phone TEXT DEFAULT NULL,
            name TEXT NOT NULL,
            city TEXT NOT NULL,
            category TEXT NOT NULL,
            qr_status TEXT NOT NULL DEFAULT 'LIVE',
            soundbox_status TEXT NOT NULL DEFAULT 'ONLINE',
            avg_gmv DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            preferred_lang TEXT NOT NULL DEFAULT 'hi-en',
            risk_flag TEXT DEFAULT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS tickets (
            id TEXT PRIMARY KEY,
            merchant_id TEXT NOT NULL REFERENCES merchants(id),
            text TEXT NOT NULL,
            channel TEXT NOT NULL DEFAULT 'WhatsApp',
            status TEXT NOT NULL DEFAULT 'OPEN',
            amount DOUBLE PRECISION,
            intent TEXT,
            priority TEXT NOT NULL DEFAULT 'HIGH',
            n8n_execution_id TEXT DEFAULT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS settlements (
            id TEXT PRIMARY KEY,
            merchant_id TEXT NOT NULL REFERENCES merchants(id),
            ticket_id TEXT,
            amount DOUBLE PRECISION NOT NULL,
            status TEXT NOT NULL,
            reason TEXT,
            utr TEXT,
            retry_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS transactions (
            id TEXT PRIMARY KEY,
            merchant_id TEXT NOT NULL REFERENCES merchants(id),
            ticket_id TEXT,
            amount DOUBLE PRECISION NOT NULL,
            status TEXT NOT NULL,
            utr TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS refunds (
            id TEXT PRIMARY KEY,
            ticket_id TEXT NOT NULL,
            merchant_id TEXT,
            transaction_id TEXT,
            amount DOUBLE PRECISION NOT NULL,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS devices (
            id TEXT PRIMARY KEY,
            merchant_id TEXT NOT NULL REFERENCES merchants(id),
            type TEXT NOT NULL,
            status TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS whatsapp_messages (
            id SERIAL PRIMARY KEY,
            ticket_id TEXT NOT NULL,
            template_id TEXT NOT NULL,
            body TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'sent',
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS human_briefs (
            id SERIAL PRIMARY KEY,
            ticket_id TEXT NOT NULL,
            queue TEXT NOT NULL DEFAULT 'RISK_OPS',
            merchant_name TEXT NOT NULL,
            amount DOUBLE PRECISION,
            checks TEXT,
            not_done TEXT,
            recommendation TEXT,
            brief_text TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS audit_events (
            id SERIAL PRIMARY KEY,
            ticket_id TEXT NOT NULL,
            ts TEXT NOT NULL,
            actor TEXT NOT NULL,
            type TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            reason_code TEXT,
            policy_token TEXT,
            consumed_at TEXT DEFAULT NULL,
            latency_ms INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS cognee_sync_log (
            id SERIAL PRIMARY KEY,
            merchant_id TEXT NOT NULL,
            action TEXT NOT NULL,
            query TEXT,
            hit_count INTEGER DEFAULT 0,
            payload_json TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS processed_messages (
            msg_id TEXT PRIMARY KEY,
            created_at TEXT NOT NULL
        );
        """)
        conn.commit()
    else:
        cur.executescript("""
        CREATE TABLE IF NOT EXISTS merchants (
            id TEXT PRIMARY KEY,
            phone TEXT DEFAULT NULL,
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
            status TEXT NOT NULL DEFAULT 'OPEN',
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
            status TEXT NOT NULL,
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
            status TEXT NOT NULL,
            utr TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (merchant_id) REFERENCES merchants(id)
        );

        CREATE TABLE IF NOT EXISTS refunds (
            id TEXT PRIMARY KEY,
            ticket_id TEXT NOT NULL,
            merchant_id TEXT,
            transaction_id TEXT,
            amount REAL NOT NULL,
            status TEXT NOT NULL,
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
            status TEXT NOT NULL DEFAULT 'sent',
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
            actor TEXT NOT NULL,
            type TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            reason_code TEXT,
            policy_token TEXT,
            consumed_at TEXT DEFAULT NULL,
            latency_ms INTEGER DEFAULT 0,
            FOREIGN KEY (ticket_id) REFERENCES tickets(id)
        );

        CREATE TABLE IF NOT EXISTS cognee_sync_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            merchant_id TEXT NOT NULL,
            action TEXT NOT NULL,
            query TEXT,
            hit_count INTEGER DEFAULT 0,
            payload_json TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS processed_messages (
            msg_id TEXT PRIMARY KEY,
            created_at TEXT NOT NULL
        );
        """)
        cur.execute("PRAGMA table_info(merchants);")
        cols = [r["name"] for r in cur.fetchall()]
        if "phone" not in cols:
            cur.execute("ALTER TABLE merchants ADD COLUMN phone TEXT DEFAULT NULL;")

        cur.execute("PRAGMA table_info(audit_events);")
        audit_cols = [r["name"] for r in cur.fetchall()]
        if "consumed_at" not in audit_cols:
            cur.execute("ALTER TABLE audit_events ADD COLUMN consumed_at TEXT DEFAULT NULL;")

        cur.execute("PRAGMA table_info(refunds);")
        refund_cols = [r["name"] for r in cur.fetchall()]
        if "merchant_id" not in refund_cols:
            cur.execute("ALTER TABLE refunds ADD COLUMN merchant_id TEXT DEFAULT NULL;")

        conn.commit()

    if close_at_end:
        conn.close()

def now_iso():
    return datetime.now(timezone.utc).isoformat()

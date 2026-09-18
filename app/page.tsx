"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  RotateCcw,
  Play,
  ExternalLink,
  ShieldAlert,
  MessageSquare,
  Sparkles,
  ArrowRight,
  Zap,
  Database,
  Shield,
  RefreshCw,
  ChevronRight,
  Activity,
  X,
  Info,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Ticket {
  id: string;
  merchant_id: string;
  merchant_name: string;
  merchant_city: string;
  merchant_category: string;
  text: string;
  channel: string;
  status: string;
  amount: number | null;
  intent: string | null;
  priority: string;
  created_at: string;
}

interface AuditEvent {
  id: number;
  ticket_id: string;
  ts: string;
  actor: string;
  type: string;
  payload: any;
  reason_code: string | null;
  policy_token: string | null;
  latency_ms: number;
}

interface Settlement {
  id: string;
  amount: number;
  status: string;
  reason: string | null;
  utr: string | null;
  retry_count: number;
}

interface TicketDetail {
  ticket: Ticket;
  merchant: any;
  settlements: Settlement[];
  transactions: any[];
  devices: any[];
  latest_whatsapp: { template_id: string; body: string; created_at: string } | null;
  human_brief: { queue: string; brief_text: string } | null;
  memory_chips: Array<{ type: string; label: string; severity: string }>;
}

// ─── API URL helper ─────────────────────────────────────────────────────────

function getApiUrl(endpoint: string): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return `${process.env.NEXT_PUBLIC_API_URL}${endpoint}`;
  }
  if (typeof window !== "undefined") {
    const { hostname, port } = window.location;
    if ((hostname === "localhost" || hostname === "127.0.0.1") && port === "3000") {
      return `http://${hostname}:8000${endpoint}`;
    }
  }
  return endpoint;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRupees(amount: number | null | undefined) {
  if (amount === null || amount === undefined) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

const STATUS_STYLE: Record<string, string> = {
  OPEN: "bg-[#E6F8FE] text-[#0077A8] border-[#b6eafd]",
  IN_PROGRESS: "bg-[#EEF2FF] text-[#3730A3] border-[#c7d2fe]",
  WAITING_ON_MERCHANT: "bg-[#FFF4E0] text-[#92400E] border-[#fde68a]",
  RESOLVED: "bg-[#D1FAE5] text-[#065F46] border-[#6EE7B7]",
  ESCALATED: "bg-[#FEE2E2] text-[#991B1B] border-[#FCA5A5]",
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ResolveOSBoard() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedId, setSelectedId] = useState<string>("T-1042");
  const [filter, setFilter] = useState<string>("ALL");
  const [ticketDetail, setTicketDetail] = useState<TicketDetail | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const [showArchDrawer, setShowArchDrawer] = useState<boolean>(false);

  const showToast = (msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Data fetching ──────────────────────────────────────────────────────────

  const loadTickets = useCallback(async () => {
    try {
      const res = await fetch(getApiUrl("/api/tickets"));
      if (res.ok) setTickets(await res.json());
    } catch {
      // silently ignore
    }
  }, []);

  const loadTicketDetail = useCallback(async (id: string) => {
    try {
      const [detailRes, eventsRes] = await Promise.all([
        fetch(getApiUrl(`/api/tickets/${id}`)),
        fetch(getApiUrl(`/api/tickets/${id}/events`)),
      ]);
      if (detailRes.ok) setTicketDetail(await detailRes.json());
      if (eventsRes.ok) setEvents(await eventsRes.json());
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => { loadTickets(); }, [loadTickets]);
  useEffect(() => { if (selectedId) loadTicketDetail(selectedId); }, [selectedId, loadTicketDetail]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleRunResolveOS = async () => {
    if (!selectedId || isRunning) return;
    setIsRunning(true);
    try {
      const res = await fetch(getApiUrl(`/api/tickets/${selectedId}/run`), { method: "POST" });
      if (res.ok) {
        await loadTickets();
        await loadTicketDetail(selectedId);
        showToast("Pipeline complete ✓");
      } else {
        showToast("Pipeline failed — check backend", "err");
      }
    } catch {
      showToast("Cannot reach backend", "err");
    } finally {
      setIsRunning(false);
    }
  };

  const handleResetDemo = async () => {
    if (isResetting) return;
    setIsResetting(true);
    try {
      const res = await fetch(getApiUrl("/api/demo/reset"), { method: "POST" });
      if (res.ok) {
        await loadTickets();
        if (selectedId) await loadTicketDetail(selectedId);
        showToast("Demo reset to seed data ✓");
      } else {
        showToast("Reset failed", "err");
      }
    } catch {
      showToast("Cannot reach backend", "err");
    } finally {
      setIsResetting(false);
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────────

  const filteredTickets = tickets.filter((t) => {
    if (filter === "OPEN") return t.status === "OPEN" || t.status === "IN_PROGRESS";
    if (filter === "WAITING") return t.status === "WAITING_ON_MERCHANT";
    if (filter === "ESCALATED") return t.status === "ESCALATED";
    return true;
  });

  const currentTicket = tickets.find((t) => t.id === selectedId) || ticketDetail?.ticket;

  const sarvamEvent = events.find((e) => e.type === "UNDERSTOOD");
  const memoryEvent = events.find((e) => e.type === "RECALLED");
  const policyEvent = events.find((e) => e.type === "DECIDED");
  const actedEvents = events.filter((e) => e.type === "ACTED" || e.type === "NOTIFIED");

  const resolveCodeColor = (code: string | null) => {
    if (!code) return "bg-gray-100 text-gray-600 border-gray-200";
    if (code.includes("OK") || code === "REFUND_OK") return "bg-[#D1FAE5] text-[#065F46] border-[#6EE7B7]";
    if (code.includes("ASK")) return "bg-[#FFF4E0] text-[#92400E] border-[#fde68a]";
    return "bg-[#FEE2E2] text-[#991B1B] border-[#FCA5A5]";
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen flex-col bg-[#F5F7FB] text-[#1B1F3B] font-sans antialiased select-none overflow-hidden">

      {/* ── TOAST ──────────────────────────────────────────────────────────── */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[100] px-4 py-2.5 rounded-lg text-xs font-semibold shadow-lg flex items-center gap-2 transition-all ${
          toast.type === "ok"
            ? "bg-[#D1FAE5] text-[#065F46] border border-[#6EE7B7]"
            : "bg-[#FEE2E2] text-[#991B1B] border border-[#FCA5A5]"
        }`}>
          {toast.type === "ok" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
          {toast.msg}
        </div>
      )}

      {/* ── TOP BAR ────────────────────────────────────────────────────────── */}
      <header className="h-13 border-b border-[#E6EAF0] bg-white px-6 flex items-center justify-between shrink-0 z-20 shadow-sm">
        <div className="flex items-center gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#002970] flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-[#00BAF2]" />
            </div>
            <div>
              <span className="text-sm font-black tracking-tight text-[#002970]">Resolve OS</span>
              <span className="ml-1.5 text-[10px] font-semibold text-[#6B7289] tracking-wider uppercase">Merchant Support AI</span>
            </div>
          </div>

          <div className="h-4 w-px bg-[#E6EAF0]" />

          {/* Live indicator */}
          <div className="flex items-center gap-1.5 bg-[#D1FAE5] px-2.5 py-1 rounded-full text-[11px] font-semibold text-[#065F46]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" />
            TEST DATA · LIVE PIPELINE
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowArchDrawer(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F5F7FB] border border-[#E6EAF0] text-[#6B7289] hover:text-[#002970] hover:border-[#002970] rounded-lg text-xs font-medium transition"
          >
            <Info className="w-3.5 h-3.5" />
            Architecture
          </button>
          <button
            onClick={handleResetDemo}
            disabled={isResetting}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-[#E6EAF0] text-[#6B7289] hover:bg-[#F5F7FB] hover:text-[#1B1F3B] rounded-lg text-xs font-medium transition disabled:opacity-50"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isResetting ? "animate-spin" : ""}`} />
            Reset Demo
          </button>
          <div className="w-7 h-7 rounded-full bg-[#002970] text-white flex items-center justify-center font-bold text-[11px]">
            SS
          </div>
        </div>
      </header>

      {/* ── MAIN LAYOUT ────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT SIDEBAR ─────────────────────────────────────────────────── */}
        <aside className="w-52 bg-white border-r border-[#E6EAF0] flex flex-col py-4 shrink-0">
          <div className="space-y-5 flex-1">
            <div>
              <div className="px-4 text-[10px] font-bold text-[#6B7289] uppercase tracking-widest mb-1">Dashboard</div>
              <nav>
                {["Overview", "Payments", "Settlements", "Refunds"].map((item) => (
                  <div
                    key={item}
                    className="px-4 py-2 text-sm text-[#6B7289] hover:bg-[#F5F7FB] hover:text-[#1B1F3B] cursor-default transition"
                  >
                    {item}
                  </div>
                ))}
              </nav>
            </div>

            <div>
              <div className="px-4 text-[10px] font-bold text-[#6B7289] uppercase tracking-widest mb-1">AI Operations</div>
              <div className="px-4 py-2.5 text-sm font-semibold text-[#002970] bg-[#EEF2FF] border-l-[3px] border-[#002970] flex items-center justify-between cursor-default">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#002970]" />
                  <span>Resolve OS</span>
                </div>
                <span className="text-[10px] bg-[#002970] text-white px-1.5 py-0.5 rounded font-bold">AI</span>
              </div>
            </div>
          </div>

          {/* Stack info */}
          <div className="px-4 pt-3 border-t border-[#E6EAF0] text-[10px] text-[#6B7289] leading-relaxed space-y-0.5">
            <div className="font-semibold text-[#1B1F3B] text-[11px]">Resolve OS Stack</div>
            <div>Sarvam 105b · Policy Engine</div>
            <div>Meta WhatsApp Cloud API</div>
            <div className="text-[#10B981] font-medium">FastAPI + SQLite + Next.js</div>
          </div>
        </aside>

        {/* ── THREE-COLUMN WORKBENCH ────────────────────────────────────────── */}
        <main className="flex-1 flex overflow-hidden">

          {/* COL 1 — TICKET QUEUE ──────────────────────────────────────────── */}
          <div className="w-[272px] bg-white border-r border-[#E6EAF0] flex flex-col shrink-0">
            <div className="p-3 border-b border-[#E6EAF0]">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-[#002970]">Queue</h2>
                  <span className="text-[11px] bg-[#F5F7FB] border border-[#E6EAF0] px-2 py-0.5 rounded-full font-semibold text-[#6B7289]">
                    {filteredTickets.length}/{tickets.length}
                  </span>
                </div>
                <button
                  onClick={loadTickets}
                  title="Refresh"
                  className="p-1 hover:bg-[#F5F7FB] rounded text-[#6B7289] hover:text-[#1B1F3B] transition"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Filter pills */}
              <div className="grid grid-cols-4 gap-1 text-[11px]">
                {["ALL", "OPEN", "WAITING", "ESCALATED"].map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`py-1 text-center rounded-md transition font-medium capitalize ${
                      filter === f
                        ? "bg-[#002970] text-white"
                        : "bg-[#F5F7FB] text-[#6B7289] hover:bg-[#E6EAF0]"
                    }`}
                  >
                    {f.toLowerCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Ticket list */}
            <div className="flex-1 overflow-y-auto divide-y divide-[#E6EAF0]">
              {filteredTickets.length === 0 && (
                <div className="p-6 text-center text-xs text-[#6B7289]">No tickets in this filter</div>
              )}
              {filteredTickets.map((t) => (
                <div
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={`p-3 cursor-pointer transition relative ${
                    t.id === selectedId
                      ? "bg-[#EEF2FF] border-l-[3px] border-[#002970]"
                      : "hover:bg-[#FAFBFD] border-l-[3px] border-transparent"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-[#002970] font-mono">{t.id}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${STATUS_STYLE[t.status] || "bg-gray-100 text-gray-600 border-gray-200"}`}>
                      {t.status.replace(/_/g, " ")}
                    </span>
                  </div>

                  <div className="text-xs font-semibold text-[#1B1F3B] truncate mb-0.5">
                    {t.merchant_name}
                    {t.merchant_city && <span className="text-[#6B7289] font-normal"> · {t.merchant_city}</span>}
                  </div>

                  <p className="text-[11px] text-[#6B7289] line-clamp-2 leading-snug mb-1.5">
                    "{t.text}"
                  </p>

                  <div className="flex items-center justify-between text-[11px] text-[#6B7289]">
                    <div className="flex items-center gap-1 text-[#10B981] font-medium">
                      <MessageSquare className="w-3 h-3" />
                      <span>{t.channel || "WhatsApp"}</span>
                    </div>
                    {t.amount && (
                      <span className="font-semibold text-[#1B1F3B] font-mono text-[10px]">
                        {formatRupees(t.amount)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* COL 2 — PIPELINE WORKSPACE ────────────────────────────────────── */}
          <div className="flex-1 bg-[#F5F7FB] flex flex-col overflow-y-auto border-r border-[#E6EAF0]">

            {/* Sticky ticket header + run button */}
            <div className="bg-white border-b border-[#E6EAF0] px-5 py-3 flex items-center justify-between sticky top-0 z-10">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <h1 className="text-sm font-bold text-[#002970] font-mono">{currentTicket?.id || "—"}</h1>
                  {currentTicket?.intent && (
                    <>
                      <span className="text-[#D1D5DB]">·</span>
                      <span className="text-xs font-medium text-[#6B7289]">
                        {currentTicket.intent.replace(/_/g, " ")}
                      </span>
                    </>
                  )}
                </div>
                <div className="text-xs text-[#6B7289]">
                  {currentTicket?.merchant_name}
                  {currentTicket?.merchant_id && (
                    <span className="ml-1 font-mono text-[#9CA3AF]">· {currentTicket.merchant_id}</span>
                  )}
                </div>
              </div>

              <button
                onClick={handleRunResolveOS}
                disabled={isRunning}
                className={`px-5 py-2 rounded-lg text-xs font-bold shadow-sm transition flex items-center gap-2 active:scale-95 ${
                  isRunning
                    ? "bg-[#002970]/60 text-white cursor-not-allowed"
                    : "bg-[#002970] hover:bg-[#001F5B] text-white cursor-pointer"
                }`}
              >
                {isRunning ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-white" />
                )}
                {isRunning
                  ? "Running pipeline…"
                  : events.length > 0
                  ? "Re-run Pipeline"
                  : "Run Resolve OS"}
              </button>
            </div>

            {/* Status banner */}
            <div className="px-5 pt-3">
              {currentTicket?.status === "RESOLVED" && (
                <div className="bg-[#D1FAE5] border border-[#6EE7B7] rounded-lg p-3 flex items-center gap-2.5 text-xs text-[#065F46] font-medium">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Closed autonomously · Action executed + merchant notified via WhatsApp.</span>
                </div>
              )}
              {currentTicket?.status === "WAITING_ON_MERCHANT" && (
                <div className="bg-[#FFF4E0] border border-[#fde68a] rounded-lg p-3 flex items-center gap-2.5 text-xs text-[#92400E] font-medium">
                  <Clock className="w-4 h-4 shrink-0" />
                  <span>Waiting on merchant · UTR clarification requested via WhatsApp. Zero funds moved.</span>
                </div>
              )}
              {currentTicket?.status === "ESCALATED" && (
                <div className="bg-[#FEE2E2] border border-[#FCA5A5] rounded-lg p-3 flex items-center gap-2.5 text-xs text-[#991B1B] font-medium">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>Escalated to Risk Ops · Freeze / threshold flag detected. 6-line brief filed.</span>
                </div>
              )}
              {currentTicket?.status === "OPEN" && !isRunning && (
                <div className="bg-white border border-[#E6EAF0] rounded-lg p-3 flex items-center gap-2.5 text-xs text-[#6B7289]">
                  <ArrowRight className="w-4 h-4 text-[#002970] shrink-0" />
                  <span>Ticket ready. Click <strong className="text-[#002970]">Run Resolve OS</strong> to run the autonomous pipeline.</span>
                </div>
              )}
              {isRunning && (
                <div className="bg-[#EEF2FF] border border-[#c7d2fe] rounded-lg p-3 flex items-center gap-2.5 text-xs text-[#3730A3] font-medium animate-pulse">
                  <Activity className="w-4 h-4 animate-spin shrink-0" />
                  <span>Executing: Sarvam 105b → Policy Engine → Tool Execution → WhatsApp dispatch…</span>
                </div>
              )}
            </div>

            {/* Pipeline cards */}
            <div className="px-5 py-4 space-y-3">

              {/* Empty state */}
              {events.length === 0 && !isRunning && (
                <div className="h-56 flex flex-col items-center justify-center text-center text-[#6B7289] border border-dashed border-[#D1D5DB] rounded-xl bg-white p-8">
                  <Sparkles className="w-8 h-8 text-[#002970]/30 mb-3" />
                  <h3 className="text-sm font-bold text-[#002970] mb-1">Pipeline ready</h3>
                  <p className="text-xs max-w-xs text-[#6B7289] leading-relaxed">
                    Select a ticket and click <span className="font-semibold text-[#002970]">Run Resolve OS</span>.
                    Sarvam analyses the Hinglish text. Policy decides. Tools act.
                  </p>
                </div>
              )}

              {/* STAGE 1: SARVAM */}
              {sarvamEvent && (
                <div className="bg-white border border-[#E6EAF0] rounded-xl p-4 shadow-sm animate-card-rise stagger-0">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#002970] text-white text-[10px] font-black tracking-wider rounded-md">
                        <Zap className="w-3 h-3" />
                        SARVAM 105b
                      </div>
                      <span className="text-xs font-bold text-[#1B1F3B]">1 · Understand</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-[#9CA3AF] font-mono">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${sarvamEvent.actor === "SARVAM" ? "bg-[#D1FAE5] text-[#065F46]" : "bg-[#FFF4E0] text-[#92400E]"}`}>
                        {sarvamEvent.actor}
                      </span>
                      {sarvamEvent.latency_ms}ms
                    </div>
                  </div>

                  <div className="bg-[#F8F9FF] rounded-lg p-3 border border-[#E6EAF0] mb-2">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[10px] font-bold text-[#6B7289] uppercase tracking-wider">Intent</span>
                      <span className="text-[10px] font-mono font-bold text-[#002970] bg-[#EEF2FF] px-1.5 py-0.5 rounded">
                        {sarvamEvent.payload?.intent}
                      </span>
                      {sarvamEvent.payload?.confidence && (
                        <span className="text-[10px] text-[#6B7289]">
                          {Math.round((sarvamEvent.payload.confidence || 0) * 100)}% confidence
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#1B1F3B] italic leading-snug">
                      "{sarvamEvent.payload?.summary_hi || currentTicket?.text}"
                    </p>
                  </div>

                  <div className="text-xs text-[#6B7289] leading-snug">
                    {sarvamEvent.payload?.summary_en}
                  </div>

                  {sarvamEvent.payload?.proposed_writes?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      <span className="text-[10px] text-[#6B7289]">Proposed:</span>
                      {sarvamEvent.payload.proposed_writes.map((w: any, i: number) => (
                        <span key={i} className="text-[10px] font-mono bg-[#F5F7FB] border border-[#E6EAF0] px-1.5 py-0.5 rounded text-[#002970]">
                          {w.action}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* STAGE 2: MEMORY RECALL */}
              {memoryEvent && (
                <div className="bg-white border border-[#E6EAF0] rounded-xl p-4 shadow-sm animate-card-rise stagger-1">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#6B7289] text-white text-[10px] font-black tracking-wider rounded-md">
                        <Database className="w-3 h-3" />
                        MEMORY
                      </div>
                      <span className="text-xs font-bold text-[#1B1F3B]">2 · Recall</span>
                    </div>
                    <span className="text-[11px] text-[#9CA3AF] font-mono">{memoryEvent.latency_ms}ms</span>
                  </div>

                  <p className="text-xs text-[#6B7289] mb-2.5">
                    Merchant history, past settlements, and risk flags from SQLite ledger:
                  </p>

                  <div className="flex flex-wrap gap-1.5">
                    {(memoryEvent.payload?.chips || []).length === 0 && (
                      <span className="text-xs text-[#9CA3AF]">No memory chips returned</span>
                    )}
                    {(memoryEvent.payload?.chips || []).map((chip: any, i: number) => {
                      const colorMap: Record<string, string> = {
                        danger: "bg-[#FEE2E2] text-[#991B1B] border-[#FCA5A5]",
                        warn: "bg-[#FFF4E0] text-[#92400E] border-[#fde68a]",
                        success: "bg-[#D1FAE5] text-[#065F46] border-[#6EE7B7]",
                        info: "bg-[#EEF2FF] text-[#3730A3] border-[#c7d2fe]",
                        neutral: "bg-[#F5F7FB] text-[#6B7289] border-[#E6EAF0]",
                      };
                      return (
                        <span
                          key={i}
                          className={`text-[11px] px-2.5 py-1 rounded border font-medium ${colorMap[chip.severity] || colorMap.neutral}`}
                        >
                          {chip.label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* STAGE 3: POLICY */}
              {policyEvent && (
                <div className="bg-white border border-[#E6EAF0] rounded-xl p-4 shadow-sm animate-card-rise stagger-2">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#1B1F3B] text-white text-[10px] font-black tracking-wider rounded-md">
                        <Shield className="w-3 h-3" />
                        POLICY
                      </div>
                      <span className="text-xs font-bold text-[#1B1F3B]">3 · Decide</span>
                    </div>
                    <span className="text-[11px] font-mono text-[#9CA3AF]">{policyEvent.latency_ms}ms</span>
                  </div>

                  <div className="flex items-center gap-2 mb-2.5 flex-wrap">
                    <span className={`text-xs font-mono font-bold px-3 py-1 rounded border ${resolveCodeColor(policyEvent.reason_code)}`}>
                      {policyEvent.reason_code}
                    </span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${policyEvent.payload?.allowed ? "text-[#065F46] bg-[#D1FAE5]" : "text-[#991B1B] bg-[#FEE2E2]"}`}>
                      {policyEvent.payload?.allowed ? "✓ ALLOWED" : "✗ BLOCKED"}
                    </span>
                    {policyEvent.policy_token && (
                      <span className="text-[10px] font-mono text-[#9CA3AF]">{policyEvent.policy_token}</span>
                    )}
                  </div>

                  <p className="text-xs text-[#1B1F3B] leading-relaxed">
                    {policyEvent.payload?.explanation}
                  </p>
                </div>
              )}

              {/* STAGE 4: ACTIONS */}
              {actedEvents.length > 0 && (
                <div className="bg-white border border-[#E6EAF0] rounded-xl p-4 shadow-sm animate-card-rise stagger-3">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#10B981] text-white text-[10px] font-black tracking-wider rounded-md">
                        <Zap className="w-3 h-3" />
                        ACTIONS
                      </div>
                      <span className="text-xs font-bold text-[#1B1F3B]">4 · Execute</span>
                    </div>
                    <span className="text-[11px] text-[#9CA3AF]">{actedEvents.length} action{actedEvents.length > 1 ? "s" : ""}</span>
                  </div>

                  <div className="space-y-1.5">
                    {actedEvents.map((act, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between bg-[#F0FDF4] px-3 py-2 rounded-lg border border-[#6EE7B7] text-xs font-mono"
                      >
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                          <span className="text-[#1B1F3B] font-semibold">
                            {act.payload?.tool || act.type}
                          </span>
                        </div>
                        <span className="text-[#6B7289] text-[11px]">✓ {act.latency_ms}ms</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* STAGE 5: WHATSAPP OUTBOX */}
              {ticketDetail?.latest_whatsapp && (
                <div className="bg-white border border-[#E6EAF0] rounded-xl p-4 shadow-sm animate-card-rise stagger-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-[#065F46]">
                      <MessageSquare className="w-4 h-4" />
                      <span>WhatsApp Sent</span>
                    </div>
                    <span className="text-[10px] bg-[#D1FAE5] text-[#065F46] border border-[#6EE7B7] px-2 py-0.5 rounded font-medium">
                      delivered
                    </span>
                  </div>

                  {/* WA bubble */}
                  <div className="bg-[#DCF8C6] text-[#1B1F3B] p-3 rounded-xl rounded-tl-sm border border-[#bce8a8] text-xs leading-relaxed max-w-sm shadow-sm">
                    <p>{ticketDetail.latest_whatsapp.body}</p>
                    <div className="flex justify-end items-center gap-1 mt-1.5 text-[10px] text-[#557049]">
                      <span>
                        {new Date(ticketDetail.latest_whatsapp.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span>· Resolve OS</span>
                      <CheckCircle2 className="w-3 h-3" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* COL 3 — CONTEXT PANEL ─────────────────────────────────────────── */}
          <div className="w-[320px] bg-white flex flex-col overflow-y-auto p-4 gap-4 shrink-0">

            {/* Merchant card */}
            <div className="border border-[#E6EAF0] rounded-xl p-4 bg-white shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-[#EEF2FF] text-[#002970] font-bold flex items-center justify-center text-sm border border-[#c7d2fe]">
                  {ticketDetail?.merchant?.name
                    ? ticketDetail.merchant.name.split(" ").map((n: string) => n[0]).join("").substring(0, 2).toUpperCase()
                    : "—"}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#002970] leading-tight">
                    {ticketDetail?.merchant?.name || "—"}
                  </h3>
                  <div className="text-xs text-[#6B7289]">
                    {[ticketDetail?.merchant?.city, ticketDetail?.merchant?.category]
                      .filter(Boolean)
                      .join(" · ")}
                    {ticketDetail?.merchant?.risk_flag && (
                      <span className="ml-1.5 text-[10px] font-bold text-[#991B1B] bg-[#FEE2E2] px-1.5 py-0.5 rounded">
                        ⚠ {ticketDetail.merchant.risk_flag}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] mb-3">
                <div className={`flex items-center gap-1.5 p-2 rounded-lg border ${
                  ticketDetail?.merchant?.qr_status === "LIVE"
                    ? "bg-[#F0FDF4] border-[#6EE7B7] text-[#065F46]"
                    : "bg-[#FEF2F2] border-[#FCA5A5] text-[#991B1B]"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${ticketDetail?.merchant?.qr_status === "LIVE" ? "bg-[#10B981]" : "bg-[#EF4444]"}`} />
                  QR {ticketDetail?.merchant?.qr_status || "—"}
                </div>
                <div className={`flex items-center gap-1.5 p-2 rounded-lg border ${
                  ticketDetail?.merchant?.soundbox_status === "ONLINE"
                    ? "bg-[#F0FDF4] border-[#6EE7B7] text-[#065F46]"
                    : "bg-[#FEF9C3] border-[#FDE047] text-[#713F12]"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${ticketDetail?.merchant?.soundbox_status === "ONLINE" ? "bg-[#10B981]" : "bg-[#EAB308]"}`} />
                  Soundbox {ticketDetail?.merchant?.soundbox_status || "—"}
                </div>
              </div>

              <div className="text-xs text-[#6B7289] flex justify-between border-t border-[#E6EAF0] pt-2">
                <span>Avg Daily GMV</span>
                <span className="font-semibold text-[#1B1F3B] font-mono">{formatRupees(ticketDetail?.merchant?.avg_gmv)}</span>
              </div>
            </div>

            {/* Settlement card */}
            <div className="border border-[#E6EAF0] rounded-xl p-4 bg-white shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold text-[#002970] uppercase tracking-wider">Settlement</h4>
                <span className="text-[10px] text-[#9CA3AF] font-mono">Source: SQLite</span>
              </div>

              {ticketDetail?.settlements && ticketDetail.settlements.length > 0 ? (
                <div className="space-y-1.5 text-xs">
                  {[
                    ["Batch ID", ticketDetail.settlements[0].id],
                    ["Amount", formatRupees(ticketDetail.settlements[0].amount)],
                    ["Retries", `${ticketDetail.settlements[0].retry_count}/2`],
                    ["UTR", ticketDetail.settlements[0].utr || "—"],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between">
                      <span className="text-[#6B7289]">{label}:</span>
                      <span className="font-semibold text-[#1B1F3B] font-mono text-[11px] truncate max-w-[160px]">{value}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center">
                    <span className="text-[#6B7289]">Status:</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                      ticketDetail.settlements[0].status === "SUCCESS"
                        ? "bg-[#D1FAE5] text-[#065F46] border-[#6EE7B7]"
                        : ticketDetail.settlements[0].status === "FAILED"
                        ? "bg-[#FEE2E2] text-[#991B1B] border-[#FCA5A5]"
                        : "bg-[#FFF4E0] text-[#92400E] border-[#fde68a]"
                    }`}>
                      {ticketDetail.settlements[0].status}
                    </span>
                  </div>
                  {ticketDetail.settlements[0].reason && (
                    <div className="text-[10px] text-[#991B1B] bg-[#FEE2E2] px-2 py-1 rounded font-mono">
                      {ticketDetail.settlements[0].reason}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-[#9CA3AF]">No settlements on record.</div>
              )}
            </div>

            {/* Human brief (escalated only) */}
            {ticketDetail?.human_brief && (
              <div className="border border-[#FCA5A5] rounded-xl p-4 bg-[#FFF8F8] shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#991B1B]">
                    <ShieldAlert className="w-4 h-4" />
                    <span>Risk Ops Brief</span>
                  </div>
                  <span className="text-[10px] bg-[#FEE2E2] text-[#991B1B] border border-[#FCA5A5] px-1.5 py-0.5 rounded font-bold">
                    {ticketDetail.human_brief.queue}
                  </span>
                </div>
                <pre className="text-[10px] text-[#1B1F3B] font-mono bg-white p-2.5 rounded border border-[#FCA5A5] overflow-x-auto whitespace-pre-wrap leading-relaxed">
                  {ticketDetail.human_brief.brief_text}
                </pre>
              </div>
            )}

            {/* Audit stream */}
            <div className="border border-[#E6EAF0] rounded-xl p-4 bg-white shadow-sm flex-1 flex flex-col min-h-[180px]">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-[#002970] uppercase tracking-wider">Audit Stream</h4>
                <span className="text-[11px] font-mono text-[#9CA3AF]">{events.length} events</span>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 text-[11px] font-mono">
                {events.length === 0 && (
                  <div className="text-[#9CA3AF] py-2">No events yet. Run the pipeline.</div>
                )}
                {events.map((e, idx) => (
                  <div key={idx} className="border-b border-[#F5F7FB] pb-1.5 last:border-0">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#002970]">{e.actor}</span>
                      <span className="text-[#9CA3AF] text-[10px]">
                        {new Date(e.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </span>
                    </div>
                    <div className="text-[#1B1F3B] truncate">
                      {e.type}{e.reason_code ? ` · ${e.reason_code}` : ""}
                    </div>
                    {e.policy_token && (
                      <div className="text-[#9CA3AF] text-[10px]">{e.policy_token} · {e.latency_ms}ms</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* ── ARCHITECTURE DRAWER ───────────────────────────────────────────── */}
      {showArchDrawer && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex justify-end" onClick={() => setShowArchDrawer(false)}>
          <div
            className="w-[420px] bg-white h-full shadow-2xl p-6 flex flex-col overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5 pb-4 border-b border-[#E6EAF0]">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#002970]" />
                <h3 className="text-sm font-bold text-[#002970]">Resolve OS Architecture</h3>
              </div>
              <button onClick={() => setShowArchDrawer(false)} className="text-[#6B7289] hover:text-[#1B1F3B] p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="bg-[#EEF2FF] border border-[#c7d2fe] p-3 rounded-lg">
                <div className="font-bold text-[#002970] mb-1 text-[11px] uppercase tracking-wider">How it works</div>
                <p className="text-[#3730A3] leading-relaxed">
                  Merchant sends a WhatsApp message. Resolve OS reads it, understands the intent in Hinglish, checks the ledger, applies deterministic rules, and either acts or escalates — without an LLM touching money.
                </p>
              </div>

              {[
                {
                  step: "1",
                  label: "WhatsApp Inbound",
                  color: "bg-[#F0FDF4] border-[#6EE7B7] text-[#065F46]",
                  badge: "META CLOUD API",
                  desc: "Merchant sends message to +1 555-201-3457. Meta delivers to POST /api/webhook/whatsapp via HTTPS."
                },
                {
                  step: "2",
                  label: "Sarvam 105b · Understand",
                  color: "bg-[#EEF2FF] border-[#c7d2fe] text-[#3730A3]",
                  badge: "LLM",
                  desc: "Sarvam reads the Hinglish ticket + current DB rows. Returns intent, summaries, proposed actions. Has ZERO write access."
                },
                {
                  step: "3",
                  label: "Ledger Memory · Recall",
                  color: "bg-[#F5F7FB] border-[#E6EAF0] text-[#6B7289]",
                  badge: "SQLITE",
                  desc: "Settlement status, transaction history, risk flags, and past ticket outcomes are loaded from the live SQLite ledger."
                },
                {
                  step: "4",
                  label: "Policy Engine · Decide",
                  color: "bg-[#1B1F3B] border-[#374151] text-white",
                  badge: "PYTHON RULES",
                  desc: "Pure if-rules on ledger state. Checks: risk flags → amount ≤ ₹50k → retries < 2 → UTR present. Model cannot override this."
                },
                {
                  step: "5",
                  label: "Tool Execution · Act",
                  color: "bg-[#F0FDF4] border-[#6EE7B7] text-[#065F46]",
                  badge: "FASTAPI",
                  desc: "Only if policy allows: update settlement row, dispatch WhatsApp reply via Meta Graph API v20. All writes require a valid policy_token from step 4."
                },
              ].map((s) => (
                <div key={s.step} className={`border rounded-xl p-3 ${s.color}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">{s.step}</span>
                      <span className="font-bold text-[12px]">{s.label}</span>
                    </div>
                    <span className="text-[9px] font-black tracking-widest opacity-70 uppercase">{s.badge}</span>
                  </div>
                  <p className="text-[11px] opacity-80 leading-relaxed">{s.desc}</p>
                </div>
              ))}

              <div className="bg-[#FFF4E0] border border-[#fde68a] p-3 rounded-lg text-[#92400E]">
                <div className="font-bold text-[11px] mb-1">⚠ Demo Setup</div>
                <ul className="space-y-0.5 text-[11px] leading-relaxed">
                  <li>• Merchant data is seeded SQLite — not live Paytm production</li>
                  <li>• Settlement retry = SQLite UPDATE, not real bank file</li>
                  <li>• Merchant routing is keyword-based (demo switch)</li>
                  <li>• WhatsApp outbound uses permanent Meta system user token</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

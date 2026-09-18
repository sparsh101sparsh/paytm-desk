"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  RotateCcw,
  Play,
  ShieldAlert,
  Sliders,
  Check,
  User,
  HelpCircle,
  AlertTriangle,
  Send,
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

// ─── Formatters ─────────────────────────────────────────────────────────────

function formatRupees(amount: number | null | undefined) {
  if (amount === null || amount === undefined) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function timeAgo(iso: string) {
  if (!iso) return "recently";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function getActorLabel(actor: string) {
  switch (actor?.toUpperCase()) {
    case "SARVAM":
      return { label: "Sarvam", color: "bg-indigo-50 text-indigo-700 border-indigo-200" };
    case "FIXTURE":
      return { label: "Fixture planner", color: "bg-red-50 text-red-700 border-red-200" };
    case "COGNEE":
      return { label: "Ledger memory", color: "bg-sky-50 text-sky-700 border-sky-200" };
    case "POLICY":
      return { label: "Policy", color: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    case "N8N":
    case "TOOL":
    default:
      return { label: "Backend", color: "bg-slate-50 text-slate-700 border-slate-200" };
  }
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function ResolveOS() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedId, setSelectedId] = useState<string>("T-1042");
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [activeTab, setActiveTab] = useState<"hero" | "whatsapp" | "all">("hero");

  const [loading, setLoading] = useState<boolean>(true);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [elapsed, setElapsed] = useState<number>(0);
  const [toast, setToast] = useState<{ type: "success" | "error" | "info"; msg: string } | null>(null);

  // Health state
  const [health, setHealth] = useState<{ status: string; sarvam: string; whatsapp: string; database: string } | null>(null);
  const [apiError, setApiError] = useState<boolean>(false);

  // Demo tool state
  const [customAmount, setCustomAmount] = useState<string>("200000");
  const [showArchPopover, setShowArchPopover] = useState<boolean>(false);

  // WhatsApp simulation composer
  const [simText, setSimText] = useState<string>("");
  const [simSending, setSimSending] = useState<boolean>(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // ─── Data Loading ──────────────────────────────────────────────────────────

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch(getApiUrl("/api/health"), { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
        setApiError(false);
      } else {
        setApiError(true);
      }
    } catch {
      setApiError(true);
    }
  }, []);

  const fetchTickets = useCallback(async () => {
    try {
      const res = await fetch(getApiUrl("/api/tickets"), { cache: "no-store" });
      if (res.ok) {
        const data: Ticket[] = await res.json();
        setTickets(data);
        setApiError(false);
      }
    } catch {
      setApiError(true);
    }
  }, []);

  const fetchDetail = useCallback(async (ticketId: string) => {
    try {
      const [dRes, eRes] = await Promise.all([
        fetch(getApiUrl(`/api/tickets/${ticketId}`), { cache: "no-store" }),
        fetch(getApiUrl(`/api/tickets/${ticketId}/events`), { cache: "no-store" }),
      ]);
      if (dRes.ok) {
        const dData = await dRes.json();
        setDetail(dData);
      }
      if (eRes.ok) {
        const eData = await eRes.json();
        setEvents(eData);
      }
    } catch {
      // Ignored
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    fetchTickets().then(() => setLoading(false));
  }, [fetchHealth, fetchTickets]);

  useEffect(() => {
    if (selectedId) {
      fetchDetail(selectedId);
    }
  }, [selectedId, fetchDetail]);

  const showToast = (type: "success" | "error" | "info", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  // ─── Actions ───────────────────────────────────────────────────────────────

  const handleReset = async () => {
    try {
      const res = await fetch(getApiUrl("/api/demo/reset"), { method: "POST" });
      if (res.ok) {
        showToast("success", "Demo reset to initial seed.");
        await fetchTickets();
        if (selectedId) await fetchDetail(selectedId);
      } else {
        showToast("error", "Reset failed — seed not loaded");
      }
    } catch {
      showToast("error", "Could not connect to backend to reset.");
    }
  };

  const handleRun = async () => {
    if (!selectedId || isRunning) return;
    setIsRunning(true);
    setElapsed(0);

    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      setElapsed((Date.now() - startTime) / 1000);
    }, 100);

    // Poll events while running
    pollRef.current = setInterval(() => {
      fetch(getApiUrl(`/api/tickets/${selectedId}/events`))
        .then((r) => r.json())
        .then((evs) => setEvents(evs))
        .catch(() => {});
    }, 350);

    try {
      const res = await fetch(getApiUrl(`/api/tickets/${selectedId}/run`), {
        method: "POST",
      });
      if (res.ok) {
        await Promise.all([fetchDetail(selectedId), fetchTickets()]);
      } else {
        const err = await res.json().catch(() => ({ detail: "Run failed" }));
        showToast("error", err.detail || "Resolve OS run failed.");
      }
    } catch {
      showToast("error", "Network error running Resolve OS.");
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
      setIsRunning(false);
      fetchDetail(selectedId);
      fetchTickets();
    }
  };

  // Stage Demo Tools
  const handleSetAmount = async () => {
    if (!detail?.ticket.merchant_id) return;
    try {
      const amt = parseFloat(customAmount);
      const res = await fetch(getApiUrl("/api/demo/set-amount"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchant_id: detail.ticket.merchant_id, amount: amt }),
      });
      if (res.ok) {
        showToast("success", `Amount updated to ₹${amt.toLocaleString("en-IN")}`);
        fetchDetail(selectedId);
        fetchTickets();
      }
    } catch {
      showToast("error", "Failed to update amount.");
    }
  };

  const handleToggleFreeze = async () => {
    if (!detail?.ticket.merchant_id) return;
    try {
      const res = await fetch(getApiUrl("/api/demo/toggle-freeze"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchant_id: detail.ticket.merchant_id }),
      });
      if (res.ok) {
        const data = await res.json();
        showToast("info", data.risk_flag ? "Risk flag set: AML_SUSPECT" : "Risk flag cleared: Normal");
        fetchDetail(selectedId);
        fetchTickets();
      }
    } catch {
      showToast("error", "Failed to toggle freeze.");
    }
  };

  const handleResetMerchant = async () => {
    if (!detail?.ticket.merchant_id) return;
    try {
      const res = await fetch(getApiUrl("/api/demo/reset-merchant"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchant_id: detail.ticket.merchant_id }),
      });
      if (res.ok) {
        showToast("success", `Reset ${detail.merchant?.name || "merchant"} to seed.`);
        fetchDetail(selectedId);
        fetchTickets();
      }
    } catch {
      showToast("error", "Failed to reset merchant.");
    }
  };

  const handleSimulateInbound = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!simText.trim() || simSending) return;
    setSimSending(true);
    try {
      const res = await fetch(getApiUrl("/api/webhook/whatsapp"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          object: "whatsapp_business_account",
          entry: [
            {
              id: "876439015402194",
              changes: [
                {
                  value: {
                    messaging_product: "whatsapp",
                    metadata: { display_phone_number: "15552013457", phone_number_id: "1329851416876776" },
                    contacts: [{ profile: { name: "Stage Tester" }, wa_id: "919876543210" }],
                    messages: [
                      {
                        from: "919876543210",
                        id: `wamid.sim_${Date.now()}`,
                        timestamp: String(Math.floor(Date.now() / 1000)),
                        text: { body: simText.trim() },
                        type: "text",
                      },
                    ],
                  },
                  field: "messages",
                },
              ],
            },
          ],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSimText("");
        await fetchTickets();
        if (data.ticket_id) {
          setSelectedId(data.ticket_id);
          setActiveTab("whatsapp");
        }
        showToast("success", `Inbound message processed → ${data.ticket_id}`);
      }
    } catch {
      showToast("error", "Failed to send simulated inbound.");
    } finally {
      setSimSending(false);
    }
  };

  // ─── Filtered Queues ───────────────────────────────────────────────────────

  const heroIds = ["T-1042", "T-1048", "T-1055"];

  const filteredTickets = tickets.filter((t) => {
    if (activeTab === "hero") {
      return heroIds.includes(t.id);
    }
    if (activeTab === "whatsapp") {
      return t.id.startsWith("T-WA") || (t.channel === "WhatsApp" && !heroIds.includes(t.id));
    }
    return true;
  });

  const heroOpenCount = tickets.filter((t) => heroIds.includes(t.id) && t.status === "OPEN").length;

  const selectedTicket = detail?.ticket || tickets.find((t) => t.id === selectedId);
  const primarySettlement = detail?.settlements?.[0];

  const isContradiction =
    selectedTicket?.status === "OPEN" &&
    primarySettlement?.status === "SUCCESS";

  const cannotAutoRetry =
    primarySettlement &&
    primarySettlement.status === "SUCCESS" &&
    selectedTicket?.status === "OPEN";

  // ─── Render Pipeline Stations ──────────────────────────────────────────────

  const understoodEv = events.find((e) => e.type === "UNDERSTOOD");
  const recalledEv = events.find((e) => e.type === "RECALLED");
  const decidedEv = events.find((e) => e.type === "DECIDED");
  const actedEv = events.find((e) => e.type === "ACTED");
  const notifiedEv = events.find((e) => e.type === "NOTIFIED");

  const stations = [
    {
      num: 1,
      name: "Message",
      sub: "received",
      done: Boolean(selectedTicket),
      active: isRunning && !understoodEv,
      detail: selectedTicket ? `${selectedTicket.channel} · ${timeAgo(selectedTicket.created_at)}` : "waiting...",
    },
    {
      num: 2,
      name: "Sarvam",
      sub: "proposed",
      done: Boolean(understoodEv),
      active: isRunning && !understoodEv,
      detail: understoodEv
        ? `${understoodEv.payload?.intent || "ANALYZED"} · Actor: ${understoodEv.actor}`
        : "Proposes plan",
    },
    {
      num: 3,
      name: "Ledger",
      sub: "read",
      done: Boolean(recalledEv || understoodEv),
      active: isRunning && understoodEv && !decidedEv,
      detail: primarySettlement
        ? `₹${primarySettlement.amount?.toLocaleString("en-IN")} · ${primarySettlement.status} · ${primarySettlement.retry_count}/2 retries`
        : "Read SQLite ledger",
    },
    {
      num: 4,
      name: "Policy",
      sub: "decided",
      done: Boolean(decidedEv),
      active: isRunning && recalledEv && !decidedEv,
      detail: decidedEv
        ? decidedEv.payload?.explanation || decidedEv.reason_code || "Decision rendered"
        : "Evaluate rules",
    },
    {
      num: 5,
      name: "Action",
      sub: "done",
      done: Boolean(actedEv || notifiedEv),
      active: isRunning && decidedEv && !actedEv,
      detail: actedEv
        ? `${actedEv.payload?.tool || "tool executed"} · ticket ${selectedTicket?.status}`
        : "Execute write tools",
    },
  ];

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#F5F7FB] text-[#1B1F3B] font-sans antialiased select-none">
      {/* ─── Top Bar (40px Paytm Navy #002970) ─────────────────────────────── */}
      <header className="h-[40px] shrink-0 bg-[#002970] border-b border-[#00BAF2]/30 flex items-center justify-between px-4 z-20">
        {/* Left: Brand */}
        <div className="flex items-center gap-2.5">
          <div className="w-5 h-5 rounded bg-[#00BAF2] flex items-center justify-center font-black text-[11px] text-white shadow-sm">
            R
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-white font-bold text-sm tracking-tight">Resolve OS</span>
            <span className="text-white/60 text-xs font-medium">Merchant Support</span>
          </div>
        </div>

        {/* Center: ONE PILL ONLY */}
        <div className="flex items-center">
          {health?.sarvam === "fixture" ? (
            <span className="px-2.5 py-0.5 rounded text-[11px] font-mono font-semibold bg-red-500/20 text-red-300 border border-red-500/40 tracking-wider">
              SARVAM FIXTURE
            </span>
          ) : (
            <span className="px-2.5 py-0.5 rounded text-[11px] font-mono font-semibold bg-amber-500/25 text-amber-300 border border-amber-500/40 tracking-wider">
              TEST DATA
            </span>
          )}
        </div>

        {/* Right: Reset Demo, Health, Help */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleReset}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white/90 bg-white/10 hover:bg-white/20 border border-white/20 rounded transition active:scale-95"
            title="Reset SQLite database to initial seed data"
          >
            <RotateCcw className="w-3 h-3 text-[#00BAF2]" />
            <span>Reset demo</span>
          </button>

          <div className="h-3.5 w-px bg-white/20" />

          {/* Health dots */}
          <div className="flex items-center gap-2 text-[11px] text-white/70">
            <div className="flex items-center gap-1" title="SQLite Database">
              <span className={`w-2 h-2 rounded-full ${apiError ? "bg-red-500 animate-pulse" : "bg-emerald-400"}`} />
              <span className="hidden sm:inline">API</span>
            </div>
            <div className="flex items-center gap-1" title={health?.sarvam === "live" ? "Sarvam 105B Live" : "Sarvam Fixture"}>
              <span className={`w-2 h-2 rounded-full ${health?.sarvam === "live" ? "bg-emerald-400" : "bg-amber-400"}`} />
              <span className="hidden sm:inline">Sarvam</span>
            </div>
            <div className="flex items-center gap-1" title="Meta WhatsApp Cloud API">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="hidden sm:inline">WhatsApp</span>
            </div>
          </div>

          <div className="h-3.5 w-px bg-white/20" />

          <button
            onClick={() => setShowArchPopover(!showArchPopover)}
            className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition"
            title="How Resolve OS Works"
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* ─── Architecture Popover ────────────────────────────────────────── */}
      {showArchPopover && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-lg shadow-2xl border border-slate-200 max-w-xl w-full p-5 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-[#002970] text-white flex items-center justify-center font-bold text-xs">
                  R
                </div>
                <h3 className="font-bold text-[#002970] text-base">Resolve OS Architecture</h3>
              </div>
              <button onClick={() => setShowArchPopover(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded font-mono text-xs text-slate-800 leading-relaxed font-semibold">
              Hinglish ticket in → Sarvam proposes → rules read the ledger → one of three endings → audit.
            </div>
            <div className="space-y-2 text-xs text-slate-600 leading-normal">
              <p>
                <strong>1. Inbound Ingestion:</strong> WhatsApp Cloud API or Desk catches exact merchant Hinglish complaint.
              </p>
              <p>
                <strong>2. Sarvam 105B Planner:</strong> Identifies intent and proposes structured actions. Proposes only — model never touches ledger funds.
              </p>
              <p>
                <strong>3. Deterministic Policy:</strong> Pure Python policy enforces Paytm thresholds (≤ ₹50k, 0 AML flags, &lt; 2 retries, UTR match).
              </p>
              <p>
                <strong>4. Three Distinct Endings:</strong>
                <span className="block text-emerald-700 font-semibold">• RESOLVED: Retry pushed on bank file with generated UTR.</span>
                <span className="block text-amber-700 font-semibold">• WAITING: Asks merchant for 12-digit UTR (no money moved).</span>
                <span className="block text-red-700 font-semibold">• ESCALATED: Account freeze / high-value handed to Risk Ops human brief.</span>
              </p>
              <p>
                <strong>5. Full Audit Ledger:</strong> Every tool execution, WhatsApp outbox dispatch, and token recorded in SQLite.
              </p>
            </div>
            <div className="text-right pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowArchPopover(false)}
                className="px-4 py-1.5 bg-[#002970] text-white rounded text-xs font-semibold hover:bg-[#001f56]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── API Offline Notice ──────────────────────────────────────────── */}
      {apiError && (
        <div className="bg-red-600 text-white px-4 py-1.5 text-xs flex items-center justify-between shrink-0 font-medium">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Cannot reach backend API at <code>{getApiUrl("")}</code>. Ensure FastAPI server is running on port 8000.</span>
          </div>
          <button
            onClick={() => { fetchHealth(); fetchTickets(); }}
            className="underline text-white font-bold hover:text-white/80"
          >
            Retry
          </button>
        </div>
      )}

      {/* ─── Main 3-Column Ops Desk ──────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ═══════════════════════════════════════════════════════════════════
            COLUMN 1: Queue (280px fixed width)
            ═══════════════════════════════════════════════════════════════════ */}
        <aside className="w-[280px] shrink-0 bg-white border-r border-slate-200 flex flex-col h-full overflow-hidden">
          {/* Queue Header */}
          <div className="p-3 border-b border-slate-100 flex items-center justify-between shrink-0">
            <span className="font-bold text-sm text-[#002970] tracking-tight">Queue</span>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#002970]/10 text-[#002970]">
              {heroOpenCount} OPEN
            </span>
          </div>

          {/* Queue Tabs */}
          <div className="flex border-b border-slate-200 bg-slate-50 text-xs shrink-0 font-medium">
            <button
              onClick={() => setActiveTab("hero")}
              className={`flex-1 py-2 text-center transition ${
                activeTab === "hero"
                  ? "bg-white text-[#002970] font-bold border-b-2 border-[#00BAF2] shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Hero demo
            </button>
            <button
              onClick={() => setActiveTab("whatsapp")}
              className={`flex-1 py-2 text-center transition ${
                activeTab === "whatsapp"
                  ? "bg-white text-[#002970] font-bold border-b-2 border-[#00BAF2] shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              WhatsApp live
            </button>
            <button
              onClick={() => setActiveTab("all")}
              className={`flex-1 py-2 text-center transition ${
                activeTab === "all"
                  ? "bg-white text-[#002970] font-bold border-b-2 border-[#00BAF2] shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              All
            </button>
          </div>

          {/* Ticket List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {loading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="animate-pulse space-y-2">
                    <div className="h-3.5 bg-slate-200 rounded w-20" />
                    <div className="h-4 bg-slate-200 rounded w-44" />
                    <div className="h-3 bg-slate-100 rounded w-full" />
                  </div>
                ))}
              </div>
            ) : filteredTickets.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                No tickets in this queue. Click &quot;Reset demo&quot; above.
              </div>
            ) : (
              filteredTickets.map((ticket) => {
                const isSelected = ticket.id === selectedId;
                const isSharmaSettledContradiction =
                  ticket.id === "T-1042" &&
                  ticket.status === "OPEN" &&
                  primarySettlement?.status === "SUCCESS";

                return (
                  <button
                    key={ticket.id}
                    onClick={() => setSelectedId(ticket.id)}
                    className={`w-full text-left p-3 transition relative flex flex-col gap-1 ${
                      isSelected
                        ? "bg-[#00BAF2]/5 border-l-[3px] border-l-[#00BAF2]"
                        : "hover:bg-slate-50/80 border-l-[3px] border-l-transparent"
                    }`}
                  >
                    {/* Row 1: ID + Status chip */}
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-slate-900 tracking-tight">
                        {ticket.id}
                      </span>
                      {/* Status chip */}
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                          ticket.status === "OPEN"
                            ? "border border-[#002970] text-[#002970]"
                            : ticket.status === "RESOLVED"
                            ? "bg-emerald-50 text-emerald-800 border border-emerald-300"
                            : ticket.status === "WAITING" || ticket.status === "WAITING_ON_MERCHANT"
                            ? "bg-amber-50 text-amber-800 border border-amber-300"
                            : "bg-red-50 text-red-800 border border-red-300"
                        }`}
                      >
                        {ticket.status === "WAITING_ON_MERCHANT" ? "WAITING" : ticket.status}
                      </span>
                    </div>

                    {/* Row 2: Merchant name · Amount */}
                    <div className="text-xs font-semibold text-slate-800 truncate">
                      {ticket.merchant_name} ·{" "}
                      <span className="font-bold text-[#002970]">
                        {formatRupees(ticket.amount)}
                      </span>
                    </div>

                    {/* Row 3: Hinglish snippet */}
                    <div className="text-[11px] text-slate-500 italic line-clamp-1">
                      &ldquo;{ticket.text}&rdquo;
                    </div>

                    {/* Row 4: Channel · Time */}
                    <div className="flex items-center justify-between text-[10px] text-slate-400 mt-0.5">
                      <span>{ticket.channel}</span>
                      <span>{timeAgo(ticket.created_at)}</span>
                    </div>

                    {/* Row Warning Chip for Contradiction Bug */}
                    {isSharmaSettledContradiction && (
                      <div className="mt-1 bg-red-100 border border-red-300 text-red-800 text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-red-600 shrink-0" />
                        <span>LEDGER ALREADY SETTLED — reset</span>
                      </div>
                    )}

                    {/* WhatsApp Live mapping explanation */}
                    {activeTab === "whatsapp" && (
                      <div className="text-[10px] text-[#00BAF2] font-medium mt-0.5">
                        {ticket.text.toLowerCase().includes("refund") || ticket.amount === 850
                          ? "mapped by keyword “refund” → Glow"
                          : ticket.text.toLowerCase().includes("freeze") || ticket.amount === 184000
                          ? "mapped by keyword “freeze” → Delhi"
                          : ticket.text.toLowerCase().includes("settlement") || ticket.amount === 14280
                          ? "mapped by keyword “settlement” → Sharma"
                          : "mapped by sender profile"}
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Inbound Simulator Composer (on WhatsApp tab) */}
          {activeTab === "whatsapp" && (
            <div className="p-3 border-t border-slate-200 bg-slate-50 shrink-0">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                Simulate Inbound WhatsApp
              </span>
              <form onSubmit={handleSimulateInbound} className="flex gap-1.5">
                <input
                  type="text"
                  value={simText}
                  onChange={(e) => setSimText(e.target.value)}
                  placeholder="e.g. 14280 nahi aaya"
                  className="flex-1 px-2 py-1 text-xs border border-slate-300 rounded focus:outline-none focus:border-[#00BAF2]"
                />
                <button
                  type="submit"
                  disabled={simSending || !simText.trim()}
                  className="px-2.5 py-1 bg-[#002970] text-white rounded text-xs font-semibold hover:bg-[#001f56] disabled:opacity-50"
                >
                  <Send className="w-3 h-3" />
                </button>
              </form>
            </div>
          )}
        </aside>

        {/* ═══════════════════════════════════════════════════════════════════
            COLUMN 2: Workspace (Fluid center column)
            ═══════════════════════════════════════════════════════════════════ */}
        <main className="flex-1 flex flex-col min-w-0 bg-[#F5F7FB] overflow-y-auto">
          {selectedTicket ? (
            <div className="p-5 max-w-4xl w-full mx-auto space-y-4">
              {/* 3a. Case Header */}
              <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h1 className="font-mono font-black text-lg text-[#002970]">
                      {selectedTicket.id}
                    </h1>
                    <span className="text-slate-400">·</span>
                    <span className="font-bold text-base text-slate-800">
                      {selectedTicket.id === "T-1042"
                        ? "Settlement missing"
                        : selectedTicket.id === "T-1048"
                        ? "Customer refund dispute"
                        : selectedTicket.id === "T-1055"
                        ? "Settlement failed · AML freeze"
                        : selectedTicket.intent || "Merchant Operations Dispute"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
                    <span>{detail?.merchant?.name || selectedTicket.merchant_name}</span>
                    <span>·</span>
                    <span>{detail?.merchant?.city || selectedTicket.merchant_city || "Delhi NCR"}</span>
                    <span>·</span>
                    <span className="font-mono text-slate-500">{selectedTicket.merchant_id}</span>
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold text-[10px]">
                      Channel: {selectedTicket.channel}
                    </span>
                  </div>
                </div>

                {/* Primary Run Resolve OS Button */}
                <div>
                  {cannotAutoRetry ? (
                    <div className="text-right">
                      <button
                        disabled
                        className="px-4 py-2 rounded font-bold text-xs bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300 shadow-none"
                      >
                        [ Run Resolve OS ]
                      </button>
                      <p className="text-[11px] font-bold text-red-600 mt-1">
                        Cannot auto-retry — ledger status is SUCCESS. Reset demo.
                      </p>
                    </div>
                  ) : (
                    <button
                      onClick={handleRun}
                      disabled={isRunning}
                      className="px-5 py-2.5 rounded font-bold text-xs bg-[#00BAF2] hover:bg-[#009ecc] text-white shadow-sm transition active:scale-95 flex items-center gap-2 disabled:opacity-75 disabled:cursor-wait"
                    >
                      {isRunning ? (
                        <>
                          <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                          <span>Running Resolve OS... ({elapsed.toFixed(1)}s)</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Run Resolve OS</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* 3b. Merchant Message (Always visible incoming WhatsApp bubble) */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block px-1">
                  Merchant Complaint · Raw Unmodified Input
                </span>
                <div className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-sm max-w-2xl">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700">
                        <User className="w-3 h-3" />
                      </div>
                      <span className="text-xs font-bold text-slate-900">
                        {detail?.merchant?.name || selectedTicket.merchant_name}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      WhatsApp Inbound · {timeAgo(selectedTicket.created_at)}
                    </span>
                  </div>
                  <p className="text-sm text-slate-900 leading-relaxed font-normal">
                    &ldquo;{selectedTicket.text}&rdquo;
                  </p>
                </div>
              </div>

              {/* 3c. Pipeline Strip — Five Stations */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block px-1">
                  Autonomous Ops Lifecycle · Driven by /events
                </span>
                <div className="grid grid-cols-5 gap-2">
                  {stations.map((st) => (
                    <div
                      key={st.num}
                      className={`p-2.5 rounded-lg border text-left transition flex flex-col justify-between min-h-[92px] ${
                        st.active
                          ? "bg-cyan-50/50 border-[#00BAF2] shadow-[0_0_12px_rgba(0,186,242,0.25)] animate-pulse"
                          : st.done
                          ? "bg-white border-slate-200 shadow-sm"
                          : "bg-slate-50/60 border-slate-200 text-slate-400"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono font-bold text-slate-400">
                            {st.num}
                          </span>
                          {st.done ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#002970]" />
                          ) : st.active ? (
                            <span className="w-2 h-2 rounded-full bg-[#00BAF2] animate-ping" />
                          ) : null}
                        </div>
                        <div className="text-xs font-bold text-slate-900 mt-0.5">{st.name}</div>
                        <div className="text-[10px] text-slate-500 capitalize">{st.sub}</div>
                      </div>

                      <div className="text-[10px] text-slate-600 line-clamp-2 mt-1 leading-tight font-medium">
                        {st.detail}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 3d. Outcome Banner (The slide they photograph) */}
              {(selectedTicket.status === "RESOLVED" ||
                selectedTicket.status === "WAITING_ON_MERCHANT" ||
                selectedTicket.status === "WAITING" ||
                selectedTicket.status === "ESCALATED") && (
                <div
                  className={`rounded-lg p-4 border-2 shadow-sm animate-in fade-in zoom-in-95 ${
                    selectedTicket.status === "RESOLVED"
                      ? "bg-emerald-50 border-emerald-500 text-emerald-950"
                      : selectedTicket.status === "WAITING_ON_MERCHANT" || selectedTicket.status === "WAITING"
                      ? "bg-amber-50 border-amber-500 text-amber-950"
                      : "bg-red-50 border-red-500 text-red-950"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {selectedTicket.status === "RESOLVED" && <CheckCircle2 className="w-6 h-6 text-emerald-600" />}
                    {(selectedTicket.status === "WAITING_ON_MERCHANT" || selectedTicket.status === "WAITING") && (
                      <AlertCircle className="w-6 h-6 text-amber-600" />
                    )}
                    {selectedTicket.status === "ESCALATED" && <ShieldAlert className="w-6 h-6 text-red-600" />}

                    <h2 className="text-xl md:text-2xl font-black tracking-tight">
                      {selectedTicket.status === "RESOLVED"
                        ? "RESOLVED · RETRY ALLOWED"
                        : selectedTicket.status === "WAITING_ON_MERCHANT" || selectedTicket.status === "WAITING"
                        ? "WAITING ON MERCHANT · UTR REQUIRED"
                        : "ESCALATED · RISK OPS REVIEW"}
                    </h2>
                  </div>

                  <p className="mt-1.5 text-sm md:text-base font-semibold opacity-90 pl-8">
                    {selectedTicket.status === "RESOLVED" &&
                      `Retry allowed on test ledger. ${formatRupees(
                        primarySettlement?.amount || selectedTicket.amount
                      )} · batch ${primarySettlement?.id || "stl_7781"}. Merchant notified.`}

                    {(selectedTicket.status === "WAITING_ON_MERCHANT" || selectedTicket.status === "WAITING") &&
                      "Did not refund. 3 payments, no UTR. Asked merchant for UTR."}

                    {selectedTicket.status === "ESCALATED" &&
                      "Did not retry. Frozen / over limit / unknown risk. Brief sent to Risk Ops."}
                  </p>
                </div>
              )}

              {/* 3e. Outbound WhatsApp Message Bubble */}
              {detail?.latest_whatsapp && (
                <div className="flex flex-col items-end space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block px-1">
                    Outbound WhatsApp Notification
                  </span>
                  <div className="bg-[#DCF8C6] border border-emerald-300 text-slate-900 rounded-lg p-3.5 shadow-sm max-w-2xl">
                    <div className="flex items-center justify-between border-b border-emerald-200/60 pb-1.5 mb-2 gap-4">
                      <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <Check className="w-3 h-3" /> TEMPLATE · allowlisted
                      </span>
                      <span className="text-[10px] text-emerald-800">
                        {detail.latest_whatsapp.created_at ? timeAgo(detail.latest_whatsapp.created_at) : "sent"}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed">{detail.latest_whatsapp.body}</p>
                    <div className="text-[10px] text-emerald-700/80 text-right mt-1.5 font-medium">
                      Meta Cloud API: delivered (or saved to outbox only)
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center p-8 text-slate-400 text-sm">
              Select a ticket from the queue on the left.
            </div>
          )}
        </main>

        {/* ═══════════════════════════════════════════════════════════════════
            COLUMN 3: Context Rail (320px fixed width - Ledger is the lock)
            ═══════════════════════════════════════════════════════════════════ */}
        <aside className="w-[320px] shrink-0 bg-white border-l border-slate-200 flex flex-col h-full overflow-y-auto p-4 space-y-4">
          {/* Card 1: Risk Ops Brief (JUMPS TO THE TOP IF ESCALATED) */}
          {detail?.human_brief && selectedTicket?.status === "ESCALATED" && (
            <div className="bg-red-50/80 border border-red-300 rounded-lg p-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-red-900 flex items-center gap-1 text-[11px] uppercase tracking-wider">
                  <ShieldAlert className="w-3.5 h-3.5 text-red-600" />
                  Risk Ops brief
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-200 text-red-900 font-bold">
                  Queue: {detail.human_brief.queue}
                </span>
              </div>
              <pre className="text-[11px] font-sans text-red-950 whitespace-pre-wrap leading-relaxed">
                {detail.human_brief.brief_text}
              </pre>
            </div>
          )}

          {/* Card 2: Ledger Card — FIRST, ALWAYS */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
              <span className="font-bold text-[#002970] text-xs uppercase tracking-wider">
                Settlement Ledger
              </span>
              <span className="text-[10px] font-mono text-slate-500 font-semibold">
                Source: SQLite · TEST DATA
              </span>
            </div>

            {/* Contradiction Warning on Card */}
            {isContradiction && (
              <div className="p-2 bg-red-100 border border-red-300 rounded text-red-900 font-bold text-[11px] leading-tight">
                ⚠️ Already settled in test DB (Status: SUCCESS). Reset demo before running.
              </div>
            )}

            {primarySettlement ? (
              <div className="space-y-1.5 font-mono text-[11px]">
                <div className="flex justify-between py-0.5 border-b border-slate-200/50">
                  <span className="text-slate-500">Batch:</span>
                  <span className="font-bold text-slate-900">{primarySettlement.id}</span>
                </div>
                <div className="flex justify-between py-0.5 border-b border-slate-200/50">
                  <span className="text-slate-500 font-sans font-medium">Amount:</span>
                  <span className="font-bold text-[#002970] bg-[#00BAF2]/10 px-1 rounded">
                    {formatRupees(primarySettlement.amount)}
                  </span>
                </div>
                <div className="flex justify-between py-0.5 border-b border-slate-200/50">
                  <span className="text-slate-500">Status:</span>
                  <span
                    className={`font-bold uppercase ${
                      primarySettlement.status === "SUCCESS"
                        ? "text-emerald-700"
                        : primarySettlement.status === "FAILED"
                        ? "text-red-700"
                        : "text-amber-700"
                    }`}
                  >
                    {primarySettlement.status}
                  </span>
                </div>
                <div className="flex justify-between py-0.5 border-b border-slate-200/50">
                  <span className="text-slate-500">Retries:</span>
                  <span className="font-bold text-slate-800">{primarySettlement.retry_count} / 2</span>
                </div>
                <div className="flex justify-between py-0.5 border-b border-slate-200/50">
                  <span className="text-slate-500">UTR:</span>
                  <span className="text-slate-800 font-semibold">{primarySettlement.utr || "—"}</span>
                </div>
                <div className="flex justify-between py-0.5 border-b border-slate-200/50">
                  <span className="text-slate-500">Freeze:</span>
                  <span className={`font-bold ${primarySettlement.reason?.includes("FROZEN") ? "text-red-600" : "text-slate-700"}`}>
                    {primarySettlement.reason?.includes("FROZEN") ? "YES (AML SUSPECT)" : "No"}
                  </span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-slate-500">Risk code:</span>
                  <span className="text-slate-700 truncate max-w-[170px]">{primarySettlement.reason || "—"}</span>
                </div>
              </div>
            ) : (
              <div className="text-slate-500 py-2 text-center text-xs">
                No active settlement batch in DB.
              </div>
            )}
          </div>

          {/* Card 3: Judge Control (Stage Demo Tools) */}
          <div className="bg-white border border-slate-300 rounded-lg p-3 space-y-2.5 text-xs shadow-sm">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#002970] text-xs uppercase tracking-wider flex items-center gap-1">
                <Sliders className="w-3.5 h-3.5 text-[#00BAF2]" />
                Demo Tools · Stage Controls
              </span>
            </div>
            <p className="text-[10px] text-slate-500 leading-tight">
              Flip Sharma amount to ₹200k or toggle Delhi freeze live on stage without SQL.
            </p>

            <div className="space-y-2 pt-1">
              {/* Amount override input */}
              <div className="flex gap-1.5">
                <input
                  type="number"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  placeholder="200000"
                  className="flex-1 px-2 py-1 text-xs border border-slate-300 rounded focus:outline-none focus:border-[#00BAF2] font-mono"
                />
                <button
                  onClick={handleSetAmount}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-900 text-white rounded text-xs font-semibold"
                >
                  Set Amount
                </button>
              </div>

              {/* Toggle Freeze */}
              <button
                onClick={handleToggleFreeze}
                className="w-full py-1.5 px-2.5 bg-red-50 hover:bg-red-100 text-red-800 border border-red-200 rounded font-semibold text-xs flex items-center justify-center gap-1.5 transition"
              >
                <ShieldAlert className="w-3 h-3" />
                <span>Toggle Freeze / AML</span>
              </button>

              {/* Reset This Merchant */}
              <button
                onClick={handleResetMerchant}
                className="w-full py-1.5 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-medium text-xs flex items-center justify-center gap-1.5 transition"
              >
                <RotateCcw className="w-3 h-3 text-slate-500" />
                <span>Reset This Merchant</span>
              </button>
            </div>
          </div>

          {/* Card 4: Policy Verification Readout */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2 text-xs">
            <span className="font-bold text-[#002970] text-xs uppercase tracking-wider block border-b border-slate-200 pb-1">
              Policy Verification
            </span>

            {/* Checks Checklist */}
            <div className="space-y-1 font-mono text-[11px]">
              <div className="flex items-center gap-1.5">
                {primarySettlement && primarySettlement.amount < 50000 ? (
                  <span className="text-emerald-700 font-bold">✓ amount &lt; ₹50,000</span>
                ) : (
                  <span className="text-red-700 font-bold">✗ amount ≥ ₹50,000 (limit exceeded)</span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {primarySettlement && primarySettlement.status === "INITIATED" ? (
                  <span className="text-emerald-700 font-bold">✓ status INITIATED</span>
                ) : primarySettlement?.status === "SUCCESS" ? (
                  <span className="text-red-700 font-bold">✗ status SUCCESS (already paid)</span>
                ) : (
                  <span className="text-slate-600">status: {primarySettlement?.status || "—"}</span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {primarySettlement && primarySettlement.retry_count < 2 ? (
                  <span className="text-emerald-700 font-bold">✓ retries &lt; 2</span>
                ) : (
                  <span className="text-red-700 font-bold">✗ retries exhausted</span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {detail?.merchant?.risk_flag || primarySettlement?.reason?.includes("FROZEN") ? (
                  <span className="text-red-700 font-bold">✗ active AML freeze flag</span>
                ) : (
                  <span className="text-emerald-700 font-bold">✓ no freeze / AML flags</span>
                )}
              </div>
            </div>

            {/* Result Arrow */}
            {decidedEv && (
              <div className="pt-1.5 border-t border-slate-200 font-bold text-xs">
                {decidedEv.payload?.action === "retry_settlement_file" ? (
                  <span className="text-emerald-700">→ ALLOW retry on ledger</span>
                ) : decidedEv.payload?.action === "ask_merchant_utr" ? (
                  <span className="text-amber-700">→ ASK merchant for UTR</span>
                ) : (
                  <span className="text-red-700">→ ESCALATE to Risk Ops</span>
                )}
              </div>
            )}
          </div>

          {/* Card 5: Audit Stream */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-1">
              <span className="font-bold text-[#002970] text-xs uppercase tracking-wider">
                Audit Stream
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                {events.length} events
              </span>
            </div>

            {events.length === 0 ? (
              <div className="text-slate-400 py-3 text-center text-xs">
                No audit events recorded yet. Click &quot;Run Resolve OS&quot;.
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {events.map((ev) => {
                  const actorMeta = getActorLabel(ev.actor);
                  return (
                    <div key={ev.id} className="text-[11px] font-sans border-b border-slate-100 pb-1.5">
                      <div className="flex items-center justify-between gap-1">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${actorMeta.color}`}>
                          {actorMeta.label}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {ev.ts ? ev.ts.slice(11, 19) : ""}
                        </span>
                      </div>
                      <div className="font-semibold text-slate-900 mt-0.5">
                        {ev.type}
                        {ev.reason_code && (
                          <span className="font-mono text-slate-600 font-normal ml-1">
                            · {ev.reason_code}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Card 6: Merchant Profile Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5 text-xs">
            <span className="font-bold text-[#002970] text-xs uppercase tracking-wider block border-b border-slate-200 pb-1">
              Merchant Profile
            </span>
            <div className="text-slate-800 font-semibold">
              {detail?.merchant?.name || selectedTicket?.merchant_name}
            </div>
            <div className="text-[11px] text-slate-500">
              {detail?.merchant?.city || "Delhi NCR"} · {detail?.merchant?.category || "Merchant Partner"}
            </div>
            <div className="flex gap-2 pt-1 text-[10px]">
              <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded font-semibold">
                QR: {detail?.merchant?.qr_status || "LIVE"}
              </span>
              <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded font-semibold">
                Soundbox: {detail?.merchant?.soundbox_status || "ONLINE"}
              </span>
            </div>
          </div>
        </aside>
      </div>

      {/* ─── Toast Notifications ─────────────────────────────────────────── */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-2">
          <div
            className={`px-4 py-2.5 rounded-lg shadow-xl text-xs font-semibold flex items-center gap-2 border ${
              toast.type === "success"
                ? "bg-emerald-800 text-white border-emerald-700"
                : toast.type === "error"
                ? "bg-red-800 text-white border-red-700"
                : "bg-slate-900 text-white border-slate-800"
            }`}
          >
            {toast.type === "success" && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
            {toast.type === "error" && <AlertCircle className="w-4 h-4 text-red-400" />}
            {toast.type === "info" && <Info className="w-4 h-4 text-[#00BAF2]" />}
            <span>{toast.msg}</span>
          </div>
        </div>
      )}
    </div>
  );
}

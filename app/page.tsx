"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Play,
  ShieldAlert,
  ChevronRight,
  ChevronDown,
  Check,
  User,
  HelpCircle,
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

  // Demo tools collapsed state
  const [customAmount, setCustomAmount] = useState<string>("200000");
  const [demoToolsOpen, setDemoToolsOpen] = useState<boolean>(false);
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
    setTimeout(() => setToast(null), 3000);
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

  // ─── Stations ──────────────────────────────────────────────────────────────

  const understoodEv = events.find((e) => e.type === "UNDERSTOOD");
  const recalledEv = events.find((e) => e.type === "RECALLED");
  const decidedEv = events.find((e) => e.type === "DECIDED");
  const actedEv = events.find((e) => e.type === "ACTED");

  const stations = [
    {
      num: 1,
      name: "Message",
      done: Boolean(selectedTicket),
      active: isRunning && !understoodEv,
      val: selectedTicket ? `WhatsApp · ${timeAgo(selectedTicket.created_at)}` : "",
    },
    {
      num: 2,
      name: "Sarvam",
      done: Boolean(understoodEv),
      active: isRunning && !understoodEv,
      val: understoodEv ? `${understoodEv.payload?.intent || "ANALYZED"} · ${understoodEv.actor}` : "",
    },
    {
      num: 3,
      name: "Ledger",
      done: Boolean(recalledEv || understoodEv),
      active: isRunning && understoodEv && !decidedEv,
      val: primarySettlement ? `₹${primarySettlement.amount?.toLocaleString("en-IN")} · ${primarySettlement.status}` : "",
    },
    {
      num: 4,
      name: "Policy",
      done: Boolean(decidedEv),
      active: isRunning && recalledEv && !decidedEv,
      val: decidedEv ? `${decidedEv.payload?.action || decidedEv.reason_code}` : "",
    },
    {
      num: 5,
      name: "Action",
      done: Boolean(actedEv),
      active: isRunning && decidedEv && !actedEv,
      val: actedEv ? `${actedEv.payload?.tool || "tool executed"}` : "",
    },
  ];

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#F5F7FB] text-[#1B1F3B] font-sans antialiased select-none">
      {/* ─── Top Bar (40px Paytm Navy #002970) ─────────────────────────────── */}
      <header className="h-[40px] shrink-0 bg-[#002970] border-b border-[#00BAF2]/30 flex items-center justify-between px-4 z-20">
        {/* Left: Brand */}
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-[#00BAF2] flex items-center justify-center font-medium text-[11px] text-white">
            R
          </div>
          <span className="text-white font-medium text-[14px] tracking-tight">Resolve OS</span>
          <span className="text-white/70 text-xs font-normal">Merchant Support</span>
        </div>

        {/* Center: ONE PILL ONLY */}
        <div className="flex items-center">
          {health?.sarvam === "fixture" ? (
            <span className="px-2 py-0.5 rounded text-[10px] font-medium tracking-[0.06em] uppercase bg-red-500/20 text-red-300 border border-red-500/40">
              SARVAM FIXTURE
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded text-[10px] font-medium tracking-[0.06em] uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40">
              TEST DATA
            </span>
          )}
        </div>

        {/* Right: Reset Demo, Health, Help */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-white/80 hover:text-white bg-white/10 hover:bg-white/15 rounded transition"
            title="Reset SQLite database to initial seed data"
          >
            <RotateCcw className="w-3 h-3 text-[#00BAF2]" />
            <span>Reset demo</span>
          </button>

          <div className="h-3 w-px bg-white/20" />

          {/* Health dots */}
          <div className="flex items-center gap-2 text-[11px] text-white/70 font-normal">
            <div className="flex items-center gap-1" title="SQLite Database">
              <span className={`w-1.5 h-1.5 rounded-full ${apiError ? "bg-red-500" : "bg-emerald-400"}`} />
              <span className="hidden sm:inline">API</span>
            </div>
            <div className="flex items-center gap-1" title={health?.sarvam === "live" ? "Sarvam 105B Live" : "Sarvam Fixture"}>
              <span className={`w-1.5 h-1.5 rounded-full ${health?.sarvam === "live" ? "bg-emerald-400" : "bg-amber-400"}`} />
              <span className="hidden sm:inline">Sarvam</span>
            </div>
            <div className="flex items-center gap-1" title="Meta WhatsApp Cloud API">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="hidden sm:inline">WhatsApp</span>
            </div>
          </div>

          <div className="h-3 w-px bg-white/20" />

          <button
            onClick={() => setShowArchPopover(!showArchPopover)}
            className="w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition"
            title="Architecture"
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* ─── Architecture Popover ────────────────────────────────────────── */}
      {showArchPopover && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 max-w-md w-full p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="font-medium text-[#002970] text-sm">Resolve OS Architecture</h3>
              <button onClick={() => setShowArchPopover(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-800 font-medium bg-slate-50 p-2.5 rounded border border-slate-200">
              Hinglish ticket in → Sarvam proposes → rules read the ledger → one of three endings → audit.
            </p>
            <div className="text-xs text-slate-600 space-y-1.5 leading-relaxed font-normal">
              <p>• <strong>Sarvam 105B:</strong> Interprets Hinglish and proposes actions. Proposes only — model never touches funds.</p>
              <p>• <strong>Deterministic Policy:</strong> Zero-LLM hard rules enforce Paytm caps (≤ ₹50k, 0 AML flags, &lt; 2 retries).</p>
              <p>• <strong>Three Endings:</strong> RESOLVED (pushed retry), WAITING (asks UTR), ESCALATED (Risk Ops brief).</p>
            </div>
          </div>
        </div>
      )}

      {/* ─── Main 3-Column Ops Desk ──────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ═══════════════════════════════════════════════════════════════════
            COLUMN 1: Queue (280px fixed width)
            ═══════════════════════════════════════════════════════════════════ */}
        <aside className="w-[280px] shrink-0 bg-white border-r border-[#E5E7EB] flex flex-col h-full overflow-hidden">
          {/* Header */}
          <div className="p-3 border-b border-[#E5E7EB] flex items-center justify-between shrink-0">
            <span className="font-medium text-[13px] text-[#002970]">Queue</span>
            <span className="text-[11px] font-normal text-slate-500">
              {heroOpenCount} open
            </span>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-[#E5E7EB] bg-slate-50 text-xs shrink-0 font-medium">
            <button
              onClick={() => setActiveTab("hero")}
              className={`flex-1 py-2 text-center transition ${
                activeTab === "hero"
                  ? "bg-white text-[#002970] font-medium border-b-2 border-[#00BAF2]"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Hero demo
            </button>
            <button
              onClick={() => setActiveTab("whatsapp")}
              className={`flex-1 py-2 text-center transition ${
                activeTab === "whatsapp"
                  ? "bg-white text-[#002970] font-medium border-b-2 border-[#00BAF2]"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              WhatsApp live
            </button>
            <button
              onClick={() => setActiveTab("all")}
              className={`flex-1 py-2 text-center transition ${
                activeTab === "all"
                  ? "bg-white text-[#002970] font-medium border-b-2 border-[#00BAF2]"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              All
            </button>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto divide-y divide-[#E5E7EB]">
            {loading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="animate-pulse space-y-2">
                    <div className="h-3 bg-slate-200 rounded w-16" />
                    <div className="h-3.5 bg-slate-200 rounded w-36" />
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

                return (
                  <button
                    key={ticket.id}
                    onClick={() => setSelectedId(ticket.id)}
                    className={`w-full text-left p-3 transition flex flex-col gap-1 ${
                      isSelected
                        ? "bg-[#00BAF2]/5 border-l-[3px] border-l-[#00BAF2]"
                        : "hover:bg-slate-50 border-l-[3px] border-l-transparent"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-900 font-mono">
                        {ticket.id}
                      </span>
                      <span
                        className={`text-[10px] font-medium px-1.5 py-0.2 rounded uppercase ${
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

                    <div className="text-[13px] font-medium text-slate-800 truncate">
                      {ticket.merchant_name} ·{" "}
                      <span className="text-[#002970]">{formatRupees(ticket.amount)}</span>
                    </div>

                    <div className="text-xs font-normal text-slate-500 truncate">
                      &ldquo;{ticket.text}&rdquo;
                    </div>

                    <div className="flex items-center justify-between text-[10px] font-medium text-slate-400 mt-0.5 tracking-[0.04em]">
                      <span>{ticket.channel}</span>
                      <span>{timeAgo(ticket.created_at)}</span>
                    </div>

                    {activeTab === "whatsapp" && (
                      <div className="text-[10px] font-medium text-[#00BAF2] mt-0.5">
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

          {/* Inbound Simulator (on WhatsApp tab) */}
          {activeTab === "whatsapp" && (
            <div className="p-3 border-t border-[#E5E7EB] bg-slate-50 shrink-0">
              <span className="text-[10px] font-medium tracking-[0.06em] text-[#6B7280] uppercase block mb-1.5">
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
                  className="px-2.5 py-1 bg-[#002970] text-white rounded text-xs font-medium hover:bg-[#001f56] disabled:opacity-50"
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
            <div className="p-6 max-w-4xl w-full mx-auto space-y-4">
              {/* 3a. Case Header */}
              <div className="bg-white rounded-lg border border-[#E5E7EB] p-4 flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-[20px] font-medium text-[#002970] font-mono">
                      {selectedTicket.id}
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className="text-base font-medium text-slate-800">
                      {selectedTicket.id === "T-1042"
                        ? "Settlement missing"
                        : selectedTicket.id === "T-1048"
                        ? "Customer refund dispute"
                        : selectedTicket.id === "T-1055"
                        ? "Settlement failed · AML freeze"
                        : selectedTicket.intent || "Merchant Operations Dispute"}
                    </span>
                  </div>
                  <div className="text-xs font-normal text-slate-500 mt-0.5">
                    {detail?.merchant?.name || selectedTicket.merchant_name} · {detail?.merchant?.city || selectedTicket.merchant_city || "Delhi NCR"} · {selectedTicket.merchant_id}
                  </div>
                </div>

                {/* Primary Run Button */}
                <div>
                  {cannotAutoRetry ? (
                    <button
                      disabled
                      className="px-4 py-2 rounded text-xs font-medium bg-slate-200 text-slate-400 cursor-not-allowed"
                    >
                      Run Resolve OS
                    </button>
                  ) : (
                    <button
                      onClick={handleRun}
                      disabled={isRunning}
                      className="px-4 py-2 rounded text-xs font-medium bg-[#002970] hover:bg-[#001f56] text-white transition active:scale-95 flex items-center gap-2 disabled:opacity-75 disabled:cursor-wait"
                    >
                      {isRunning ? (
                        <>
                          <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                          <span>Running... ({elapsed.toFixed(1)}s)</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3 h-3 fill-current" />
                          <span>Run Resolve OS</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* 3b. Merchant Message (Clean bubble) */}
              <div className="bg-white border border-[#E5E7EB] rounded-lg p-4 max-w-2xl">
                <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 mb-2.5">
                  <span className="text-xs font-medium text-slate-900">
                    {detail?.merchant?.name || selectedTicket.merchant_name}
                  </span>
                  <span className="text-[11px] font-normal text-slate-400">
                    WhatsApp · {timeAgo(selectedTicket.created_at)}
                  </span>
                </div>
                <p className="text-[14px] font-normal text-slate-900 leading-relaxed">
                  &ldquo;{selectedTicket.text}&rdquo;
                </p>
              </div>

              {/* 3c. Pipeline Strip (5 quiet stations) */}
              <div className="space-y-1.5">
                <span className="text-xs font-medium text-slate-700 block px-0.5">
                  Pipeline
                </span>
                <div className="grid grid-cols-5 gap-2">
                  {stations.map((st) => (
                    <div
                      key={st.num}
                      className={`p-3 rounded-lg border text-left flex flex-col justify-between min-h-[76px] ${
                        st.active
                          ? "bg-cyan-50/40 border-[#00BAF2] animate-pulse"
                          : st.done
                          ? "bg-white border-[#E5E7EB]"
                          : "bg-slate-50/50 border-[#E5E7EB]"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-slate-400 font-mono">
                          {st.num}
                        </span>
                        {st.done && <Check className="w-3.5 h-3.5 text-[#002970]" />}
                      </div>
                      <div className="text-xs font-medium text-slate-900 mt-1">
                        {st.name}
                      </div>
                      <div className="text-[10px] font-normal text-slate-500 truncate mt-0.5">
                        {st.val}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 3d. Outcome Banner (The photographable slide) */}
              {(selectedTicket.status === "RESOLVED" ||
                selectedTicket.status === "WAITING_ON_MERCHANT" ||
                selectedTicket.status === "WAITING" ||
                selectedTicket.status === "ESCALATED") && (
                <div
                  className={`rounded-lg p-5 border ${
                    selectedTicket.status === "RESOLVED"
                      ? "bg-emerald-50 border-emerald-500 text-emerald-950"
                      : selectedTicket.status === "WAITING_ON_MERCHANT" || selectedTicket.status === "WAITING"
                      ? "bg-amber-50 border-amber-500 text-amber-950"
                      : "bg-red-50 border-red-500 text-red-950"
                  }`}
                >
                  <div className="text-lg font-medium tracking-tight">
                    {selectedTicket.status === "RESOLVED"
                      ? "RESOLVED · RETRY ALLOWED"
                      : selectedTicket.status === "WAITING_ON_MERCHANT" || selectedTicket.status === "WAITING"
                      ? "WAITING ON MERCHANT · UTR REQUIRED"
                      : "ESCALATED · RISK OPS REVIEW"}
                  </div>

                  <p className="mt-1 text-sm font-normal opacity-90">
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

              {/* 3e. Outbound WhatsApp */}
              {detail?.latest_whatsapp && (
                <div className="flex flex-col items-end">
                  <div className="bg-[#DCF8C6] border border-emerald-200 text-slate-900 rounded-lg p-4 max-w-2xl">
                    <div className="flex items-center justify-between border-b border-emerald-200/50 pb-1 mb-2 gap-4">
                      <span className="text-[10px] font-medium tracking-[0.06em] text-emerald-800 uppercase">
                        TEMPLATE · allowlisted
                      </span>
                      <span className="text-[11px] font-normal text-emerald-700">
                        {timeAgo(detail.latest_whatsapp.created_at)}
                      </span>
                    </div>
                    <p className="text-[14px] font-normal leading-relaxed text-slate-900">
                      {detail.latest_whatsapp.body}
                    </p>
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
            COLUMN 3: Context Rail (320px fixed width)
            ═══════════════════════════════════════════════════════════════════ */}
        <aside className="w-[320px] shrink-0 bg-white border-l border-[#E5E7EB] flex flex-col h-full overflow-y-auto p-4 space-y-4">
          {/* Card 1: Risk Ops Brief (JUMPS TO TOP IF ESCALATED) */}
          {detail?.human_brief && selectedTicket?.status === "ESCALATED" && (
            <div className="bg-red-50/80 border border-red-200 rounded-lg p-3 space-y-2">
              <span className="text-[10px] font-medium tracking-[0.06em] uppercase text-red-700 block">
                Risk Ops brief
              </span>
              <pre className="text-xs font-sans text-red-950 whitespace-pre-wrap leading-relaxed font-normal">
                {detail.human_brief.brief_text}
              </pre>
            </div>
          )}

          {/* Card 2: Settlement Ledger (FIRST, ALWAYS) */}
          <div className="bg-slate-50 border border-[#E5E7EB] rounded-lg p-3.5 space-y-2">
            <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
              <span className="text-[10px] font-medium tracking-[0.06em] uppercase text-[#6B7280]">
                SETTLEMENT
              </span>
              <span className="text-[10px] font-medium text-slate-400">
                Source: SQLite · TEST DATA
              </span>
            </div>

            {/* SINGLE Warning Banner */}
            {isContradiction && (
              <div className="p-2 bg-red-100/90 border border-red-300 rounded text-red-900 font-medium text-xs">
                Already settled in test DB · reset demo
              </div>
            )}

            {primarySettlement ? (
              <div className="space-y-1.5 text-xs font-normal">
                <div className="flex justify-between py-0.5 border-b border-slate-200/50">
                  <span className="text-[#6B7280] uppercase text-[10px] font-medium tracking-[0.06em]">BATCH</span>
                  <span className="font-mono text-slate-900">{primarySettlement.id}</span>
                </div>
                <div className="flex justify-between py-0.5 border-b border-slate-200/50 items-center">
                  <span className="text-[#6B7280] uppercase text-[10px] font-medium tracking-[0.06em]">AMOUNT</span>
                  <span className="text-sm font-medium text-[#002970]">
                    {formatRupees(primarySettlement.amount)}
                  </span>
                </div>
                <div className="flex justify-between py-0.5 border-b border-slate-200/50">
                  <span className="text-[#6B7280] uppercase text-[10px] font-medium tracking-[0.06em]">STATUS</span>
                  <span
                    className={`font-medium ${
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
                  <span className="text-[#6B7280] uppercase text-[10px] font-medium tracking-[0.06em]">RETRIES</span>
                  <span className="text-slate-800">{primarySettlement.retry_count} / 2</span>
                </div>
                <div className="flex justify-between py-0.5 border-b border-slate-200/50">
                  <span className="text-[#6B7280] uppercase text-[10px] font-medium tracking-[0.06em]">UTR</span>
                  <span className="font-mono text-slate-800">{primarySettlement.utr || "—"}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-[#6B7280] uppercase text-[10px] font-medium tracking-[0.06em]">FREEZE</span>
                  <span className={primarySettlement.reason?.includes("FROZEN") ? "text-red-600 font-medium" : "text-slate-700"}>
                    {primarySettlement.reason?.includes("FROZEN") ? "YES · AML" : "No"}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-slate-400 py-2 text-center text-xs">
                No active settlement batch in DB.
              </div>
            )}
          </div>

          {/* Card 3: Policy Verification (Only visible after run) */}
          {decidedEv && (
            <div className="bg-slate-50 border border-[#E5E7EB] rounded-lg p-3.5 space-y-2">
              <span className="text-[10px] font-medium tracking-[0.06em] uppercase text-[#6B7280] block border-b border-slate-200 pb-1">
                POLICY CHECKS
              </span>

              <div className="space-y-1 text-xs font-normal">
                <div>
                  {primarySettlement && primarySettlement.amount < 50000 ? (
                    <span className="text-emerald-700">✓ amount &lt; ₹50,000</span>
                  ) : (
                    <span className="text-red-700">✗ amount ≥ ₹50,000</span>
                  )}
                </div>
                <div>
                  {primarySettlement && primarySettlement.status === "INITIATED" ? (
                    <span className="text-emerald-700">✓ status INITIATED</span>
                  ) : primarySettlement?.status === "SUCCESS" ? (
                    <span className="text-red-700">✗ status is SUCCESS</span>
                  ) : (
                    <span className="text-slate-600">status: {primarySettlement?.status || "—"}</span>
                  )}
                </div>
                <div>
                  {primarySettlement && primarySettlement.retry_count < 2 ? (
                    <span className="text-emerald-700">✓ retries &lt; 2</span>
                  ) : (
                    <span className="text-red-700">✗ retries exhausted</span>
                  )}
                </div>
                <div>
                  {detail?.merchant?.risk_flag || primarySettlement?.reason?.includes("FROZEN") ? (
                    <span className="text-red-700">✗ active AML freeze flag</span>
                  ) : (
                    <span className="text-emerald-700">✓ no freeze / AML</span>
                  )}
                </div>
              </div>

              <div className="pt-1.5 border-t border-slate-200 text-xs font-medium">
                {decidedEv.payload?.action === "retry_settlement_file" ? (
                  <span className="text-emerald-700">→ ALLOW retry</span>
                ) : decidedEv.payload?.action === "ask_merchant_utr" ? (
                  <span className="text-amber-700">→ ASK UTR</span>
                ) : (
                  <span className="text-red-700">→ ESCALATE</span>
                )}
              </div>
            </div>
          )}

          {/* Card 4: Audit Stream */}
          <div className="bg-slate-50 border border-[#E5E7EB] rounded-lg p-3.5 space-y-2">
            <div className="flex items-center justify-between border-b border-slate-200 pb-1">
              <span className="text-[10px] font-medium tracking-[0.06em] uppercase text-[#6B7280]">
                AUDIT STREAM
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                {events.length}
              </span>
            </div>

            {events.length === 0 ? (
              <div className="text-slate-400 py-2 text-center text-xs">
                No events yet.
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {events.map((ev) => {
                  const actorMeta = getActorLabel(ev.actor);
                  return (
                    <div key={ev.id} className="text-xs border-b border-slate-200/50 pb-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className={`px-1.5 py-0.2 rounded text-[9px] font-medium border ${actorMeta.color}`}>
                          {actorMeta.label}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {ev.ts ? ev.ts.slice(11, 19) : ""}
                        </span>
                      </div>
                      <div className="font-medium text-slate-800 text-[11px] mt-0.5">
                        {ev.type}
                        {ev.reason_code && (
                          <span className="font-mono text-slate-500 font-normal ml-1">
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

          {/* Card 5: Demo Tools (Collapsed behind toggle) */}
          <div className="border border-[#E5E7EB] rounded-lg bg-white overflow-hidden">
            <button
              onClick={() => setDemoToolsOpen(!demoToolsOpen)}
              className="w-full p-3 text-left flex items-center justify-between text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
            >
              <span>Demo tools</span>
              {demoToolsOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>

            {demoToolsOpen && (
              <div className="p-3 border-t border-[#E5E7EB] space-y-2 bg-slate-50/50">
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
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-900 text-white rounded text-xs font-medium"
                  >
                    Set
                  </button>
                </div>

                <button
                  onClick={handleToggleFreeze}
                  className="w-full py-1 px-2 bg-red-50 hover:bg-red-100 text-red-800 border border-red-200 rounded text-xs font-medium transition"
                >
                  Toggle Freeze / AML
                </button>

                <button
                  onClick={handleResetMerchant}
                  className="w-full py-1 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium transition"
                >
                  Reset This Merchant
                </button>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* ─── Toast Notifications ─────────────────────────────────────────── */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50">
          <div className="px-3.5 py-2 rounded-lg shadow-lg text-xs font-medium flex items-center gap-2 border bg-slate-900 text-white border-slate-800">
            {toast.type === "success" && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
            {toast.type === "error" && <AlertCircle className="w-3.5 h-3.5 text-red-400" />}
            {toast.type === "info" && <Info className="w-3.5 h-3.5 text-[#00BAF2]" />}
            <span>{toast.msg}</span>
          </div>
        </div>
      )}
    </div>
  );
}

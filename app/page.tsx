"use client";

import React, { useState, useEffect } from "react";
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  RotateCcw,
  Play,
  Share2,
  ExternalLink,
  ShieldAlert,
  Building2,
  Smartphone,
  QrCode,
  FileText,
  ChevronRight,
  Database,
  Workflow,
  Sparkles,
  ArrowRight,
  UserCheck,
  Send,
  MessageSquare
} from "lucide-react";

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

function getApiUrl(endpoint: string): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return `${process.env.NEXT_PUBLIC_API_URL}${endpoint}`;
  }
  if (typeof window !== "undefined") {
    if ((window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") && window.location.port === "3000") {
      return `http://${window.location.hostname}:8000${endpoint}`;
    }
    return endpoint;
  }
  return endpoint;
}

export default function ResolveOSBoard() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedId, setSelectedId] = useState<string>("T-1042");
  const [filter, setFilter] = useState<string>("ALL");
  const [ticketDetail, setTicketDetail] = useState<TicketDetail | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>("Resolve OS");
  const [showN8nModal, setShowN8nModal] = useState<boolean>(false);
  const [showGraphDrawer, setShowGraphDrawer] = useState<boolean>(false);

  // Load tickets
  const loadTickets = async () => {
    try {
      const res = await fetch(getApiUrl("/api/tickets"));
      if (res.ok) {
        const data = await res.json();
        setTickets(data);
      }
    } catch (err) {
      console.error("Failed to load tickets", err);
    }
  };

  // Load ticket details and events
  const loadTicketDetail = async (id: string) => {
    try {
      const [detailRes, eventsRes] = await Promise.all([
        fetch(getApiUrl(`/api/tickets/${id}`)),
        fetch(getApiUrl(`/api/tickets/${id}/events`))
      ]);
      if (detailRes.ok) {
        const detail = await detailRes.json();
        setTicketDetail(detail);
      }
      if (eventsRes.ok) {
        const evs = await eventsRes.json();
        setEvents(evs);
      }
    } catch (err) {
      console.error("Failed to load ticket detail", err);
    }
  };

  useEffect(() => {
    loadTickets();
  }, []);

  useEffect(() => {
    if (selectedId) {
      loadTicketDetail(selectedId);
    }
  }, [selectedId]);

  // Run Resolve OS
  const handleRunResolveOS = async () => {
    if (!selectedId || isRunning) return;
    setIsRunning(true);
    try {
      const res = await fetch(getApiUrl(`/api/tickets/${selectedId}/run`), {
        method: "POST"
      });
      if (res.ok) {
        await loadTickets();
        await loadTicketDetail(selectedId);
      }
    } catch (err) {
      console.error("Error running Resolve OS", err);
    } finally {
      setIsRunning(false);
    }
  };

  // Reset Demo
  const handleResetDemo = async () => {
    try {
      const res = await fetch(getApiUrl("/api/demo/reset"), { method: "POST" });
      if (res.ok) {
        await loadTickets();
        if (selectedId) {
          await loadTicketDetail(selectedId);
        }
      }
    } catch (err) {
      console.error("Error resetting demo", err);
    }
  };

  const filteredTickets = tickets.filter((t) => {
    if (filter === "OPEN") return t.status === "OPEN" || t.status === "IN_PROGRESS";
    if (filter === "WAITING") return t.status === "WAITING_ON_MERCHANT";
    if (filter === "ESCALATED") return t.status === "ESCALATED";
    return true;
  });

  const currentTicket = tickets.find((t) => t.id === selectedId) || ticketDetail?.ticket;

  // Derive cards from audit_events
  const sarvamEvent = events.find((e) => e.type === "UNDERSTOOD");
  const cogneeEvent = events.find((e) => e.type === "RECALLED");
  const policyEvent = events.find((e) => e.type === "DECIDED");
  const actedEvents = events.filter((e) => e.type === "ACTED" || e.type === "NOTIFIED");

  const formatRupees = (amount: number | null | undefined) => {
    if (amount === null || amount === undefined) return "—";
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0
    }).format(amount);
  };

  return (
    <div className="flex h-screen flex-col bg-[#F5F7FB] text-[#1B1F3B] font-sans antialiased select-none overflow-hidden">
      {/* 1. TOP BAR */}
      <header className="h-14 border-b border-[#E6EAF0] bg-white px-6 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-6">
          <div className="flex items-baseline gap-1.5 cursor-pointer">
            <span className="text-xl font-black tracking-tight text-[#002970]">paytm</span>
            <span className="text-xs font-semibold text-[#00BAF2] tracking-wider uppercase">for Business</span>
          </div>
          <div className="h-4 w-px bg-[#E6EAF0]" />
          <div className="flex items-center gap-2 bg-[#E7F6EE] px-2.5 py-1 rounded-full text-xs font-semibold text-[#14804A]">
            <span className="w-2 h-2 rounded-full bg-[#14804A] animate-pulse" />
            TEST DATA MODE
          </div>
        </div>

        <div className="flex items-center gap-5 text-xs font-medium text-[#6B7289]">
          <button
            onClick={() => setShowN8nModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#E6F8FE] text-[#002970] rounded-md hover:bg-[#d6f2fd] transition font-semibold"
          >
            <Workflow className="w-3.5 h-3.5 text-[#00BAF2]" />
            n8n Canvas Peek
          </button>
          <span className="cursor-pointer hover:text-[#002970]">SUPPORT</span>
          <span className="cursor-pointer hover:text-[#002970]">NEED HELP?</span>
          <div className="w-8 h-8 rounded-full bg-[#002970] text-white flex items-center justify-center font-bold text-xs">
            SS
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER: LEFT RAIL + 3-COLUMN BOARD */}
      <div className="flex flex-1 overflow-hidden">
        {/* 2. LEFT RAIL */}
        <aside className="w-56 bg-white border-r border-[#E6EAF0] flex flex-col justify-between py-4 shrink-0">
          <div className="space-y-6">
            <div>
              <div className="px-5 text-[11px] font-bold text-[#6B7289] uppercase tracking-wider mb-2">
                Dashboard
              </div>
              <nav className="space-y-0.5">
                {["Home", "Payments", "Settlements", "Refunds", "Reports"].map((item) => (
                  <div
                    key={item}
                    className="px-5 py-2 text-sm font-normal text-[#1B1F3B] hover:bg-[#F5F7FB] cursor-pointer flex items-center justify-between"
                  >
                    {item}
                  </div>
                ))}
              </nav>
            </div>

            <div>
              <div className="px-5 text-[11px] font-bold text-[#6B7289] uppercase tracking-wider mb-2">
                Accept
              </div>
              <div className="px-5 py-2 text-sm font-normal text-[#1B1F3B] hover:bg-[#F5F7FB] cursor-pointer">
                My QR
              </div>
            </div>

            <div>
              <div className="px-5 text-[11px] font-bold text-[#6B7289] uppercase tracking-wider mb-2">
                Intelligence
              </div>
              <div
                onClick={() => setActiveTab("Resolve OS")}
                className="px-5 py-2.5 text-sm font-semibold text-[#002970] bg-[#E6F8FE] border-l-[3px] border-[#00BAF2] flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#00BAF2]" />
                  <span>Resolve OS</span>
                </div>
                <span className="text-[10px] bg-[#00BAF2] text-white px-1.5 py-0.5 rounded font-bold">AI</span>
              </div>
            </div>
          </div>

          <div className="px-5 text-[11px] text-[#6B7289] leading-tight border-t border-[#E6EAF0] pt-3">
            <span className="font-semibold block text-[#1B1F3B]">Paytm Intelligence</span>
            Powered by Sarvam · Cognee · n8n
          </div>
        </aside>

        {/* 3. THREE COLUMNS WORKBENCH */}
        <main className="flex-1 flex overflow-hidden">
          {/* COLUMN 1: QUEUE (280px) */}
          <div className="w-[280px] bg-white border-r border-[#E6EAF0] flex flex-col shrink-0">
            <div className="p-3.5 border-b border-[#E6EAF0]">
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-[#002970]">Tickets</h2>
                  <span className="text-xs bg-[#F5F7FB] border border-[#E6EAF0] px-2 py-0.5 rounded-full font-semibold text-[#6B7289]">
                    {tickets.length}
                  </span>
                </div>
                <button
                  onClick={loadTickets}
                  title="Refresh Queue"
                  className="p-1 hover:bg-[#F5F7FB] rounded text-[#6B7289]"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Filter pills */}
              <div className="grid grid-cols-4 gap-1 text-[11px] font-medium">
                {["ALL", "OPEN", "WAITING", "ESCALATED"].map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`py-1 text-center rounded transition capitalize ${
                      filter === f
                        ? "bg-[#002970] text-white font-semibold"
                        : "bg-[#F5F7FB] text-[#6B7289] hover:bg-[#E6EAF0]"
                    }`}
                  >
                    {f.toLowerCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Ticket Cards List */}
            <div className="flex-1 overflow-y-auto divide-y divide-[#E6EAF0]">
              {filteredTickets.map((t) => {
                const isSelected = t.id === selectedId;
                const statusStyles: Record<string, string> = {
                  OPEN: "bg-[#E6F8FE] text-[#00BAF2] border-[#b6eafd]",
                  IN_PROGRESS: "bg-[#EAEFF8] text-[#002970] border-[#c4d4f0]",
                  WAITING_ON_MERCHANT: "bg-[#FFF4E0] text-[#C47B00] border-[#ffe2ab]",
                  RESOLVED: "bg-[#E7F6EE] text-[#14804A] border-[#b6e8cf]",
                  ESCALATED: "bg-[#FDECEC] text-[#D32F2F] border-[#f9c5c5]",
                };

                return (
                  <div
                    key={t.id}
                    onClick={() => setSelectedId(t.id)}
                    className={`p-3 cursor-pointer transition relative ${
                      isSelected
                        ? "bg-[#E6F8FE] border-l-[3px] border-[#00BAF2]"
                        : "hover:bg-[#FAFBFD]"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-[#002970] font-mono">{t.id}</span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                          statusStyles[t.status] || "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {t.status.replace("_", " ")}
                      </span>
                    </div>

                    <div className="text-xs font-semibold text-[#1B1F3B] truncate mb-0.5">
                      {t.merchant_name} · <span className="text-[#6B7289] font-normal">{t.merchant_city}</span>
                    </div>

                    <p className="text-[11px] text-[#6B7289] line-clamp-2 leading-tight mb-2">
                      “{t.text}”
                    </p>

                    <div className="flex items-center justify-between text-[11px] text-[#6B7289] pt-1 border-t border-[#E6EAF0]/60">
                      <div className="flex items-center gap-1 text-[#14804A] font-medium">
                        <MessageSquare className="w-3 h-3" />
                        <span>WhatsApp</span>
                      </div>
                      <span className="font-semibold text-[#1B1F3B] font-mono">
                        {formatRupees(t.amount)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* COLUMN 2: WORKSPACE (Center flex) */}
          <div className="flex-1 bg-[#F5F7FB] flex flex-col overflow-y-auto border-r border-[#E6EAF0]">
            {/* Ticket Header & Actions */}
            <div className="bg-white border-b border-[#E6EAF0] px-6 py-4 flex items-center justify-between sticky top-0 z-10">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <h1 className="text-base font-bold text-[#002970] font-mono">{currentTicket?.id}</h1>
                  <span className="text-xs text-[#6B7289]">·</span>
                  <span className="text-xs font-semibold text-[#1B1F3B]">
                    {currentTicket?.intent?.replace("_", " ") || "Merchant Support Inquiry"}
                  </span>
                </div>
                <div className="text-xs text-[#6B7289]">
                  {currentTicket?.merchant_name} · MID: <span className="font-mono">{currentTicket?.merchant_id}</span>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  onClick={handleResetDemo}
                  className="px-3 py-1.5 border border-[#E6EAF0] text-[#6B7289] hover:bg-[#F5F7FB] hover:text-[#1B1F3B] rounded-lg text-xs font-medium transition flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset demo
                </button>

                <button
                  onClick={handleRunResolveOS}
                  disabled={isRunning}
                  className={`px-5 py-2 rounded-lg text-xs font-semibold shadow-paytm transition flex items-center gap-2 cursor-pointer active:scale-95 ${
                    isRunning
                      ? "bg-[#00BAF2]/70 text-white cursor-not-allowed"
                      : "bg-[#00BAF2] hover:bg-[#00A8DC] text-white"
                  }`}
                >
                  <Play className={`w-3.5 h-3.5 ${isRunning ? "animate-spin" : "fill-white"}`} />
                  {isRunning
                    ? "Running Resolve OS..."
                    : currentTicket?.status === "RESOLVED" || currentTicket?.status === "WAITING_ON_MERCHANT" || currentTicket?.status === "ESCALATED"
                    ? "Re-run Resolve OS"
                    : "Run Resolve OS"}
                </button>
              </div>
            </div>

            {/* Status Banner */}
            <div className="px-6 pt-4">
              {currentTicket?.status === "RESOLVED" && (
                <div className="bg-[#E7F6EE] border border-[#b6e8cf] rounded-lg p-3 flex items-center gap-2.5 text-xs text-[#14804A] font-medium">
                  <CheckCircle2 className="w-4 h-4 text-[#14804A] shrink-0" />
                  <span>Closed autonomously by Resolve OS · Settlement pushed & merchant notified via WhatsApp.</span>
                </div>
              )}
              {currentTicket?.status === "WAITING_ON_MERCHANT" && (
                <div className="bg-[#FFF4E0] border border-[#ffe2ab] rounded-lg p-3 flex items-center gap-2.5 text-xs text-[#C47B00] font-medium">
                  <Clock className="w-4 h-4 text-[#C47B00] shrink-0" />
                  <span>Waiting on merchant for UTR · Dispatched WhatsApp clarification request. Zero funds moved.</span>
                </div>
              )}
              {currentTicket?.status === "ESCALATED" && (
                <div className="bg-[#FDECEC] border border-[#f9c5c5] rounded-lg p-3 flex items-center gap-2.5 text-xs text-[#D32F2F] font-medium">
                  <ShieldAlert className="w-4 h-4 text-[#D32F2F] shrink-0" />
                  <span>Escalated to Risk Ops · Critical freeze/threshold flag detected. 6-line brief filed.</span>
                </div>
              )}
              {currentTicket?.status === "OPEN" && !isRunning && (
                <div className="bg-white border border-[#E6EAF0] rounded-lg p-3 flex items-center gap-2.5 text-xs text-[#6B7289]">
                  <ArrowRight className="w-4 h-4 text-[#00BAF2] shrink-0" />
                  <span>Ticket ready for processing. Click <strong className="text-[#002970]">Run Resolve OS</strong> to evaluate.</span>
                </div>
              )}
              {isRunning && (
                <div className="bg-[#E6F8FE] border border-[#b6eafd] rounded-lg p-3 flex items-center gap-2.5 text-xs text-[#002970] font-medium animate-pulse">
                  <Workflow className="w-4 h-4 text-[#00BAF2] animate-spin shrink-0" />
                  <span>Executing autonomous pipeline: Sarvam 105b → Cognee graph → Policy → n8n...</span>
                </div>
              )}
            </div>

            {/* Timeline of Work Cards (No Chat UI!) */}
            <div className="px-6 py-4 space-y-3.5 flex-1">
              {events.length === 0 && !isRunning && (
                <div className="h-64 flex flex-col items-center justify-center text-center text-[#6B7289] border border-dashed border-[#E6EAF0] rounded-xl bg-white p-8">
                  <Sparkles className="w-8 h-8 text-[#00BAF2] mb-2" />
                  <h3 className="text-sm font-bold text-[#002970]">Autonomous Teammate Stage</h3>
                  <p className="text-xs max-w-sm mt-1 text-[#6B7289]">
                    Select a ticket from the queue and click <span className="font-semibold text-[#00BAF2]">Run Resolve OS</span>.
                    Real Sarvam proposals, Cognee memory recall, Policy decisions, and n8n tool actions will execute here.
                  </p>
                </div>
              )}

              {/* CARD 1: SARVAM (Understood) */}
              {sarvamEvent && (
                <div className="bg-white border border-[#E6EAF0] rounded-xl p-4 shadow-paytm animate-card-rise stagger-0">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-[#002970] text-white text-[10px] font-black tracking-wider rounded">
                        SARVAM
                      </span>
                      <span className="text-xs font-bold text-[#002970]">1. Understood (Language & Intent)</span>
                    </div>
                    <span className="text-[11px] text-[#6B7289] font-mono">
                      {sarvamEvent.latency_ms}ms · model: sarvam-105b
                    </span>
                  </div>

                  <div className="bg-[#F5F7FB] rounded-lg p-2.5 mb-2 text-xs border border-[#E6EAF0]">
                    <div className="text-[11px] font-semibold text-[#002970] mb-0.5">
                      Intent: <span className="font-mono">{sarvamEvent.payload?.intent}</span> (Hinglish hi-en)
                    </div>
                    <p className="text-xs text-[#1B1F3B] italic">
                      “{sarvamEvent.payload?.summary_hi || currentTicket?.text}”
                    </p>
                  </div>
                  <div className="text-xs text-[#6B7289]">
                    Summary: {sarvamEvent.payload?.summary_en}
                  </div>
                </div>
              )}

              {/* CARD 2: COGNEE (Remembered) */}
              {cogneeEvent && (
                <div className="bg-white border border-[#E6EAF0] rounded-xl p-4 shadow-paytm animate-card-rise stagger-1">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-[#00BAF2] text-white text-[10px] font-black tracking-wider rounded">
                        COGNEE
                      </span>
                      <span className="text-xs font-bold text-[#002970]">2. Remembered (Merchant Graph Memory)</span>
                    </div>
                    <button
                      onClick={() => setShowGraphDrawer(true)}
                      className="text-[11px] text-[#00BAF2] font-semibold hover:underline flex items-center gap-1"
                    >
                      <span>open graph</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>

                  <p className="text-xs text-[#6B7289] mb-2.5">
                    Queried merchant knowledge graph for past settlement batches, repeat inquiries, and operational risk flags:
                  </p>

                  <div className="flex flex-wrap gap-1.5">
                    {(cogneeEvent.payload?.chips || []).map((chip: any, i: number) => {
                      const colorMap: Record<string, string> = {
                        danger: "bg-[#FDECEC] text-[#D32F2F] border-[#f9c5c5]",
                        warn: "bg-[#FFF4E0] text-[#C47B00] border-[#ffe2ab]",
                        success: "bg-[#E7F6EE] text-[#14804A] border-[#b6e8cf]",
                        info: "bg-[#E6F8FE] text-[#002970] border-[#b6eafd]",
                        neutral: "bg-[#F5F7FB] text-[#6B7289] border-[#E6EAF0]",
                      };
                      return (
                        <span
                          key={i}
                          className={`text-xs px-2.5 py-1 rounded-md border font-medium ${
                            colorMap[chip.severity] || colorMap.neutral
                          }`}
                        >
                          {chip.label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* CARD 3: POLICY (Decided) */}
              {policyEvent && (
                <div className="bg-white border border-[#E6EAF0] rounded-xl p-4 shadow-paytm animate-card-rise stagger-2">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-[#1B1F3B] text-white text-[10px] font-black tracking-wider rounded">
                        POLICY
                      </span>
                      <span className="text-xs font-bold text-[#002970]">3. Decided (Deterministic Guardrails)</span>
                    </div>
                    <span className="text-[11px] font-mono text-[#6B7289]">
                      Token: {policyEvent.policy_token}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`text-xs font-mono font-bold px-3 py-1 rounded-md border ${
                        policyEvent.reason_code === "SETTLEMENT_RETRY_OK"
                          ? "bg-[#E7F6EE] text-[#14804A] border-[#b6e8cf]"
                          : policyEvent.reason_code === "ASK_MERCHANT_UTR"
                          ? "bg-[#FFF4E0] text-[#C47B00] border-[#ffe2ab]"
                          : "bg-[#FDECEC] text-[#D32F2F] border-[#f9c5c5]"
                      }`}
                    >
                      {policyEvent.reason_code}
                    </span>
                  </div>

                  <p className="text-xs text-[#1B1F3B] leading-relaxed">
                    {policyEvent.payload?.explanation}
                  </p>
                </div>
              )}

              {/* CARD 4: N8N (Acted) */}
              {actedEvents.length > 0 && (
                <div className="bg-white border border-[#E6EAF0] rounded-xl p-4 shadow-paytm animate-card-rise stagger-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-[#FF6D5A] text-white text-[10px] font-black tracking-wider rounded">
                        N8N
                      </span>
                      <span className="text-xs font-bold text-[#002970]">4. Acted (Workflow Execution)</span>
                    </div>
                    <span className="text-[11px] text-[#6B7289] font-mono">
                      Runtime: n8n webhook
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {actedEvents.map((act, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between bg-[#F5F7FB] px-3 py-1.5 rounded-lg border border-[#E6EAF0] text-xs font-mono"
                      >
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#14804A]" />
                          <span className="text-[#1B1F3B] font-semibold">
                            {act.payload?.tool || act.type}
                          </span>
                        </div>
                        <span className="text-[#6B7289] text-[11px]">
                          ✓ {act.latency_ms}ms
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* CARD 5: WHATSAPP OUTBOX PREVIEW */}
              {ticketDetail?.latest_whatsapp && (
                <div className="bg-white border border-[#E6EAF0] rounded-xl p-4 shadow-paytm animate-card-rise stagger-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[#14804A]">
                      <MessageSquare className="w-3.5 h-3.5 text-[#14804A]" />
                      <span>WhatsApp Dispatched to Merchant</span>
                    </div>
                    <span className="text-[10px] text-[#6B7289] bg-[#E7F6EE] px-2 py-0.5 rounded font-medium">
                      status: sent
                    </span>
                  </div>

                  {/* WhatsApp Message Bubble */}
                  <div className="max-w-md bg-[#DCF8C6] text-[#1B1F3B] p-3 rounded-lg rounded-tl-none border border-[#bce8a8] shadow-sm text-xs leading-relaxed relative">
                    <p className="font-sans">{ticketDetail.latest_whatsapp.body}</p>
                    <div className="flex justify-end items-center gap-1 mt-1 text-[10px] text-[#557049]">
                      <span>{new Date(ticketDetail.latest_whatsapp.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <span>· via Resolve OS</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* COLUMN 3: CONTEXT (340px) */}
          <div className="w-[340px] bg-white flex flex-col overflow-y-auto p-4 space-y-4 shrink-0">
            {/* Merchant Card */}
            <div className="border border-[#E6EAF0] rounded-xl p-4 shadow-paytm bg-white">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-11 h-11 rounded-full bg-[#E6F8FE] text-[#002970] font-bold flex items-center justify-center text-sm border border-[#b6eafd]">
                  {ticketDetail?.merchant?.name
                    ? ticketDetail.merchant.name
                        .split(" ")
                        .map((n: string) => n[0])
                        .join("")
                        .substring(0, 2)
                        .toUpperCase()
                    : "SK"}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#002970] leading-tight">
                    {ticketDetail?.merchant?.name || "Merchant"}
                  </h3>
                  <div className="text-xs text-[#6B7289]">
                    {ticketDetail?.merchant?.city} · {ticketDetail?.merchant?.category} · <span className="text-[#14804A] font-semibold">ACTIVE</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                <div className="flex items-center gap-1.5 bg-[#F5F7FB] p-2 rounded-lg border border-[#E6EAF0]">
                  <span className="w-2 h-2 rounded-full bg-[#14804A]" />
                  <span className="font-medium text-[#1B1F3B]">QR LIVE</span>
                </div>
                <div className="flex items-center gap-1.5 bg-[#F5F7FB] p-2 rounded-lg border border-[#E6EAF0]">
                  <span className="w-2 h-2 rounded-full bg-[#14804A]" />
                  <span className="font-medium text-[#1B1F3B]">Soundbox ONLINE</span>
                </div>
              </div>

              <div className="text-xs text-[#6B7289] flex justify-between border-t border-[#E6EAF0] pt-2">
                <span>Avg Daily GMV</span>
                <span className="font-semibold text-[#1B1F3B] font-mono">
                  {formatRupees(ticketDetail?.merchant?.avg_gmv)}
                </span>
              </div>
            </div>

            {/* Latest Settlement */}
            <div className="border border-[#E6EAF0] rounded-xl p-4 shadow-paytm bg-white">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-[#002970] uppercase tracking-wider">
                  Latest Settlement
                </h4>
                <span className="text-[11px] text-[#6B7289]">Source: SQLite</span>
              </div>

              {ticketDetail?.settlements && ticketDetail.settlements.length > 0 ? (
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between font-mono">
                    <span className="text-[#6B7289]">Batch ID:</span>
                    <span className="font-bold text-[#002970]">{ticketDetail.settlements[0].id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#6B7289]">Amount:</span>
                    <span className="font-bold text-[#1B1F3B] font-mono">
                      {formatRupees(ticketDetail.settlements[0].amount)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#6B7289]">Status:</span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                        ticketDetail.settlements[0].status === "SUCCESS"
                          ? "bg-[#E7F6EE] text-[#14804A] border-[#b6e8cf]"
                          : ticketDetail.settlements[0].status === "FAILED"
                          ? "bg-[#FDECEC] text-[#D32F2F] border-[#f9c5c5]"
                          : "bg-[#FFF4E0] text-[#C47B00] border-[#ffe2ab]"
                      }`}
                    >
                      {ticketDetail.settlements[0].status}
                    </span>
                  </div>
                  <div className="flex justify-between font-mono text-[11px]">
                    <span className="text-[#6B7289]">UTR:</span>
                    <span className="text-[#1B1F3B] truncate max-w-[170px]">
                      {ticketDetail.settlements[0].utr || "—"}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-[#6B7289]">No settlements on record.</div>
              )}
            </div>

            {/* Human Ops Brief (Only if Escalated) */}
            {ticketDetail?.human_brief && (
              <div className="border border-[#f9c5c5] rounded-xl p-4 shadow-paytm bg-[#FFF8F8]">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#D32F2F]">
                    <ShieldAlert className="w-4 h-4 text-[#D32F2F]" />
                    <span>HUMAN INBOX: {ticketDetail.human_brief.queue}</span>
                  </div>
                  <span className="text-[10px] bg-[#FDECEC] text-[#D32F2F] px-1.5 py-0.5 rounded font-bold">
                    URGENT
                  </span>
                </div>
                <pre className="text-[11px] text-[#1B1F3B] font-mono bg-white p-2.5 rounded border border-[#f9c5c5] overflow-x-auto whitespace-pre-wrap leading-relaxed">
                  {ticketDetail.human_brief.brief_text}
                </pre>
                <button className="mt-2.5 w-full py-1.5 bg-white border border-[#D32F2F] text-[#D32F2F] hover:bg-[#FDECEC] rounded-lg text-xs font-semibold transition">
                  Assign to Risk Officer
                </button>
              </div>
            )}

            {/* Compact Audit Stream */}
            <div className="border border-[#E6EAF0] rounded-xl p-4 shadow-paytm bg-white flex-1 flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-[#002970] uppercase tracking-wider">
                  Audit Stream
                </h4>
                <span className="text-[11px] font-mono text-[#6B7289]">
                  {events.length} events
                </span>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2 text-[11px] font-mono divide-y divide-[#E6EAF0]">
                {events.map((e, idx) => (
                  <div key={idx} className="pt-2 first:pt-0">
                    <div className="flex items-center justify-between text-[#6B7289]">
                      <span className="font-semibold text-[#002970]">{e.actor}</span>
                      <span>{new Date(e.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                    </div>
                    <div className="text-[#1B1F3B] truncate">
                      {e.type} {e.reason_code ? `· ${e.reason_code}` : ""}
                    </div>
                    {e.policy_token && (
                      <div className="text-[#6B7289] text-[10px]">
                        {e.policy_token} · {e.latency_ms}ms
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* MODAL: n8n Workflow Visualizer */}
      {showN8nModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl border border-[#E6EAF0] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 border-b border-[#E6EAF0] flex items-center justify-between bg-[#F5F7FB]">
              <div className="flex items-center gap-2.5">
                <Workflow className="w-5 h-5 text-[#FF6D5A]" />
                <h3 className="text-sm font-bold text-[#002970]">
                  n8n Workflow Execution Canvas: Resolve OS — Merchant Ticket
                </h3>
              </div>
              <button
                onClick={() => setShowN8nModal(false)}
                className="text-xs font-bold text-[#6B7289] hover:text-[#1B1F3B] p-1"
              >
                ✕ Close
              </button>
            </div>

            <div className="p-6 overflow-y-auto bg-[#FAFBFD] space-y-6">
              <div className="bg-[#E6F8FE] border border-[#b6eafd] p-3 rounded-lg text-xs text-[#002970]">
                💡 <strong>Judge Note:</strong> This visualizes the real importable workflow located in{" "}
                <code className="bg-white px-1.5 py-0.5 rounded font-mono text-[#002970]">
                  n8n/desk-merchant-ticket.json
                </code>
                . When running tickets, nodes transition dynamically.
              </div>

              {/* Node graph representation */}
              <div className="grid grid-cols-3 gap-4">
                {[
                  { name: "Webhook: Run Resolve OS", type: "webhook", desc: "POST /desk/run with ticket_id", state: events.length > 0 ? "complete" : "ready" },
                  { name: "HTTP: Load Ticket & Merchant", type: "http", desc: "Fetch state from SQLite backend", state: events.length > 0 ? "complete" : "ready" },
                  { name: "HTTP: Sarvam 105b Planner", type: "http", desc: "POST https://api.sarvam.ai/v1/chat", state: sarvamEvent ? "complete" : "ready" },
                  { name: "HTTP: Cognee Recall", type: "http", desc: "Search merchant memory & past batches", state: cogneeEvent ? "complete" : "ready" },
                  { name: "Function: Policy Decide", type: "function", desc: "Deterministic rules evaluation", state: policyEvent ? "complete" : "ready" },
                  { name: "Switch: Allow / Ask / Escalate", type: "switch", desc: `Branch by reason code: ${policyEvent?.reason_code || "pending"}`, state: policyEvent ? "complete" : "ready" },
                  { name: "Tool: retry_settlement_file", type: "tool", desc: "Mutate settlements table & assign UTR", state: actedEvents.some(a => a.payload?.tool === "retry_settlement_file") ? "complete" : "skipped" },
                  { name: "Tool: send_whatsapp", type: "tool", desc: "Insert into whatsapp_messages outbox", state: actedEvents.some(a => a.payload?.tool === "send_whatsapp") ? "complete" : "skipped" },
                  { name: "Tool: assign_human", type: "tool", desc: "Dispatch brief to human_briefs RISK_OPS", state: actedEvents.some(a => a.payload?.tool === "assign_human") ? "complete" : "skipped" }
                ].map((node, i) => (
                  <div
                    key={i}
                    className={`border rounded-xl p-3.5 transition shadow-sm ${
                      node.state === "complete"
                        ? "bg-[#E7F6EE] border-[#b6e8cf]"
                        : node.state === "ready"
                        ? "bg-white border-[#E6EAF0]"
                        : "bg-gray-50 border-gray-200 opacity-60"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] uppercase font-bold text-[#6B7289] tracking-wider">{node.type}</span>
                      <span className={`w-2.5 h-2.5 rounded-full ${node.state === "complete" ? "bg-[#14804A]" : "bg-gray-300"}`} />
                    </div>
                    <div className="text-xs font-bold text-[#002970]">{node.name}</div>
                    <div className="text-[11px] text-[#6B7289] mt-1">{node.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DRAWER: Cognee Memory Subgraph */}
      {showGraphDrawer && (
        <div className="fixed inset-y-0 right-0 w-96 bg-white border-l border-[#E6EAF0] shadow-2xl z-50 p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-[#E6EAF0] mb-4">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-[#00BAF2]" />
                <h3 className="text-sm font-bold text-[#002970]">Cognee Knowledge Graph</h3>
              </div>
              <button
                onClick={() => setShowGraphDrawer(false)}
                className="text-xs font-bold text-[#6B7289] hover:text-[#1B1F3B]"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-[#6B7289] mb-4">
              Visualizing semantic memory nodes linked to merchant{" "}
              <strong className="text-[#002970]">{ticketDetail?.merchant?.name}</strong>:
            </p>

            <div className="space-y-3">
              <div className="p-3 bg-[#E6F8FE] rounded-lg border border-[#b6eafd] text-xs">
                <span className="text-[10px] font-bold text-[#00BAF2] uppercase block">Merchant Node</span>
                <span className="font-semibold text-[#002970]">{ticketDetail?.merchant?.name}</span> ({ticketDetail?.merchant?.id})
              </div>

              <div className="flex justify-center text-[#6B7289]">↓ is_associated_with</div>

              <div className="p-3 bg-[#FFF4E0] rounded-lg border border-[#ffe2ab] text-xs">
                <span className="text-[10px] font-bold text-[#C47B00] uppercase block">Settlement Batch Node</span>
                <span className="font-mono font-semibold text-[#1B1F3B]">{ticketDetail?.settlements?.[0]?.id || "stl_batch"}</span> · Status: {ticketDetail?.settlements?.[0]?.status}
              </div>

              <div className="flex justify-center text-[#6B7289]">↓ evaluated_by</div>

              <div className="p-3 bg-[#F5F7FB] rounded-lg border border-[#E6EAF0] text-xs">
                <span className="text-[10px] font-bold text-[#6B7289] uppercase block">Operational Policy SOP</span>
                <span>Max auto-retry ₹50,000 · Retries &lt; 2 · Age &lt; 48h</span>
              </div>
            </div>
          </div>

          <button
            onClick={() => setShowGraphDrawer(false)}
            className="w-full py-2 bg-[#F5F7FB] hover:bg-[#E6EAF0] text-[#002970] rounded-lg text-xs font-semibold transition"
          >
            Close Graph View
          </button>
        </div>
      )}
    </div>
  );
}

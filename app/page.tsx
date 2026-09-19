"use client";

import React, { useState, useEffect, useCallback, useRef, useLayoutEffect, useMemo } from "react";
import {
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Play,
  ShieldAlert,
  ChevronRight,
  ChevronDown,
  Check,
  HelpCircle,
  X,
  Info,
  MessageSquare,
  Upload,
  Brain,
  Database,
  Sliders,
  SendHorizontal,
  ArrowRight,
  GripVertical,
  Phone,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Ticket {
  id: string;
  merchant_id: string;
  merchant_name: string;
  merchant_phone?: string | null;
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

function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const clean = phone.replace(/\D/g, "");
  if (clean.length === 12 && clean.startsWith("91")) {
    return `+91 ${clean.slice(2, 7)} ${clean.slice(7)}`;
  }
  if (clean.length === 10) {
    return `+91 ${clean.slice(0, 5)} ${clean.slice(5)}`;
  }
  return phone.startsWith("+") ? phone : `+${phone}`;
}

function getTicketContact(ticket: Ticket): string {
  if (ticket.merchant_phone) return formatPhone(ticket.merchant_phone);
  if (ticket.merchant_id?.startsWith("m_91") || (ticket.merchant_id?.startsWith("m_") && /^\d+$/.test(ticket.merchant_id.slice(2)))) {
    return formatPhone(ticket.merchant_id.slice(2));
  }
  return ticket.merchant_name || ticket.merchant_id;
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
    case "SARVAM_AI":
      return { label: "Sarvam AI", color: "bg-indigo-50 text-indigo-700 border-indigo-200" };
    case "FIXTURE":
      return { label: "Fixture fallback", color: "bg-amber-50 text-amber-700 border-amber-200" };
    case "COGNEE":
    case "LEDGER_MEMORY":
      return { label: "Ledger memory", color: "bg-sky-50 text-sky-700 border-sky-200" };
    case "POLICY":
    case "POLICY_ENGINE":
      return { label: "Policy Engine", color: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    case "OPERATOR":
      return { label: "Human Operator", color: "bg-purple-50 text-purple-700 border-purple-200" };
    default:
      return { label: actor || "System", color: "bg-slate-50 text-slate-700 border-slate-200" };
  }
}

function getPlainReason(code?: string): string {
  if (!code) return "";
  const map: Record<string, string> = {
    SETTLEMENT_RETRY_OK: "Settlement retry initiated (< ₹50,000, clean ledger)",
    SETTLEMENT_RETRY_DENIED_AMOUNT: "Exceeds ₹50k limit, escalated to Risk Ops",
    SETTLEMENT_RETRY_DENIED_STATUS: "Non-retryable status, escalated to Risk Ops",
    SETTLEMENT_RETRY_DENIED_RISK: "Max retries reached or compliance flag active",
    SETTLEMENT_ALREADY_SUCCESS: "Already settled with verified bank UTR",
    SETTLEMENT_NOT_FOUND: "No matching settlement found in ledger",
    ASK_MERCHANT_UTR: "Multiple candidate payments, requested UTR from merchant",
    REFUND_OK: "Refund approved for verified payment",
    REFUND_DENIED_AMBIGUOUS: "Ambiguous refund details, requested clarification",
    ESCALATE_RISK: "Account risk flag active, escalated to Risk Ops",
    ESCALATE_QR_LOGISTICS: "QR standee damage escalated to Field Logistics",
    ESCALATE_DEVICE_OFFLINE: "Device offline in registry, escalated to Field Ops",
    ESCALATE_DEVICE_OPS: "Soundbox audio fault escalated to Device Ops",
    ESCALATE_UNKNOWN_INTENT: "Clarification requested from merchant",
    GREETING_ACK: "Merchant greeting acknowledged",
    HUMAN_APPROVED: "Operator manual override approved",
    HUMAN_REJECTED: "Operator manual override rejected",
    ASK_CLARIFICATION: "Bare amount without issue context, asked for clarification",
  };
  return map[code] || code.replace(/_/g, " ").toLowerCase();
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function ResolveOS() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [fallbackLedger, setFallbackLedger] = useState<{ merchant: any; settlements: Settlement[] } | null>(null);

  // Tab State & Gliding Indicator Tracking (NETRA Pattern)
  const [activeTab, setActiveTab] = useState<"hero" | "whatsapp" | "all">("whatsapp");
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);
  const [tabPillStyle, setTabPillStyle] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const tabItemRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const [loading, setLoading] = useState<boolean>(true);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [elapsed, setElapsed] = useState<number>(0);
  const [toast, setToast] = useState<{ type: "success" | "error" | "info"; msg: string } | null>(null);

  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  // Health state
  const [health, setHealth] = useState<{ status: string; sarvam: string; whatsapp: string; database: string } | null>(null);
  const [apiError, setApiError] = useState<boolean>(false);

  // Demo tools collapsed state
  const [customAmount, setCustomAmount] = useState<string>("200000");
  const [demoToolsOpen, setDemoToolsOpen] = useState<boolean>(false);
  const [showArchPopover, setShowArchPopover] = useState<boolean>(false);

  // Resizable Column Splitters State & Handlers
  const [queueWidth, setQueueWidth] = useState<number>(350);
  const [forensicWidth, setForensicWidth] = useState<number>(340);
  const [isDraggingLeft, setIsDraggingLeft] = useState<boolean>(false);
  const [isDraggingRight, setIsDraggingRight] = useState<boolean>(false);

  useEffect(() => {
    try {
      const savedQueue = localStorage.getItem("ros_queue_width");
      if (savedQueue) {
        const parsed = parseInt(savedQueue, 10);
        if (!isNaN(parsed) && parsed >= 330) {
          setQueueWidth(Math.max(280, Math.min(480, parsed)));
        } else {
          setQueueWidth(350);
        }
      }
      const savedForensic = localStorage.getItem("ros_forensic_width");
      if (savedForensic) {
        const parsed = parseInt(savedForensic, 10);
        if (!isNaN(parsed)) setForensicWidth(Math.max(260, Math.min(520, parsed)));
      }
    } catch {}
  }, []);

  const handleLeftResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setIsDraggingLeft(true);
    const startX = e.clientX;
    const startWidth = queueWidth;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.max(220, Math.min(460, startWidth + delta));
      setQueueWidth(newWidth);
    };

    const onPointerUp = () => {
      setIsDraggingLeft(false);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      try {
        localStorage.setItem("ros_queue_width", String(queueWidth));
      } catch {}
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }, [queueWidth]);

  const handleRightResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setIsDraggingRight(true);
    const startX = e.clientX;
    const startWidth = forensicWidth;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const delta = startX - moveEvent.clientX;
      const newWidth = Math.max(260, Math.min(520, startWidth + delta));
      setForensicWidth(newWidth);
    };

    const onPointerUp = () => {
      setIsDraggingRight(false);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      try {
        localStorage.setItem("ros_forensic_width", String(forensicWidth));
      } catch {}
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }, [forensicWidth]);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const knownTicketIdsRef = useRef<Set<string>>(new Set());
  const isInitialLoadRef = useRef<boolean>(true);

  // ─── Data Loading ──────────────────────────────────────────────────────────

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch(getApiUrl("/api/health"), { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setHealth((prev) => (JSON.stringify(prev) === JSON.stringify(data) ? prev : data));
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
        setTickets((prev) => (JSON.stringify(prev) === JSON.stringify(data) ? prev : data));
        setApiError(false);

        if (isInitialLoadRef.current) {
          isInitialLoadRef.current = false;
          knownTicketIdsRef.current = new Set(data.map((t) => t.id));
          const hasLiveWa = data.some((t) => t.id.startsWith("T-WA"));
          if (hasLiveWa) {
            setActiveTab("whatsapp");
            const latestWa = data.find((t) => t.id.startsWith("T-WA"));
            if (latestWa) setSelectedId(latestWa.id);
          } else {
            setActiveTab("hero");
          }
        } else {
          // Find any newly arrived WhatsApp ticket
          const newWaTicket = data.find(
            (t) => (t.id.startsWith("T-WA") || t.channel === "WhatsApp") && !knownTicketIdsRef.current.has(t.id)
          );
          if (newWaTicket) {
            // Only auto-select if user is on WhatsApp tab or has no active selection
            // Never hijack activeTab away from Hero/All unexpectedly
            if (activeTabRef.current === "whatsapp" || !selectedIdRef.current) {
              setSelectedId(newWaTicket.id);
            }
            showToast("info", `New WhatsApp message from ${getTicketContact(newWaTicket)}`);
          }
          knownTicketIdsRef.current = new Set(data.map((t) => t.id));
        }
      }
    } catch {
      setApiError(true);
    }
  }, []);

  const fetchFallbackLedger = useCallback(async () => {
    try {
      const res = await fetch(getApiUrl("/api/demo/ledger"), { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setFallbackLedger((prev) => (JSON.stringify(prev) === JSON.stringify(data) ? prev : data));
      }
    } catch {
      // Ignored
    }
  }, []);

  const fetchDetail = useCallback(async (ticketId: string, showIndicator = false) => {
    if (!ticketId) return;
    if (showIndicator) setDetailLoading(true);
    try {
      const [dRes, eRes] = await Promise.all([
        fetch(getApiUrl(`/api/tickets/${ticketId}`), { cache: "no-store" }),
        fetch(getApiUrl(`/api/tickets/${ticketId}/events`), { cache: "no-store" }),
      ]);
      if (dRes.ok) {
        const dData = await dRes.json();
        if (ticketId === selectedIdRef.current) {
          setDetail((prev) => (JSON.stringify(prev) === JSON.stringify(dData) ? prev : dData));
        }
      }
      if (eRes.ok) {
        const eData = await eRes.json();
        if (ticketId === selectedIdRef.current) {
          setEvents((prev) => (JSON.stringify(prev) === JSON.stringify(eData) ? prev : eData));
        }
      }
    } catch {
      // Ignored
    } finally {
      if (ticketId === selectedIdRef.current) {
        setDetailLoading(false);
      }
    }
  }, []);

  // Poll tickets, health, and fallback ledger every 2s with zero unneeded re-renders
  useEffect(() => {
    fetchHealth();
    fetchTickets().then(() => setLoading(false));
    fetchFallbackLedger();

    const interval = setInterval(() => {
      fetchTickets();
      fetchHealth();
      fetchFallbackLedger();
    }, 2000);

    return () => clearInterval(interval);
  }, [fetchHealth, fetchTickets, fetchFallbackLedger]);

  // Keep detail & audit events updated for selected ticket
  useEffect(() => {
    if (selectedId) {
      fetchDetail(selectedId, true);
      const pollTimer = setInterval(() => {
        fetchDetail(selectedId, false);
      }, 2000);
      return () => clearInterval(pollTimer);
    }
  }, [selectedId, fetchDetail]);

  const showToast = (type: "success" | "error" | "info", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  // ─── Gliding Pill Layout Calculations (NETRA Pattern) ─────────────────────

  // Reposition Queue Tab Gliding Pill
  useLayoutEffect(() => {
    const updateTabPosition = () => {
      const targetId = hoveredTab ?? activeTab;
      const targetElement = tabItemRefs.current[targetId];
      const container = tabsContainerRef.current;

      if (targetElement && container) {
        const targetRect = targetElement.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const left = targetRect.left - containerRect.left;
        const top = targetRect.top - containerRect.top;
        const width = targetRect.width;
        const height = targetRect.height;

        setTabPillStyle({ left, top, width, height });
      }
    };

    updateTabPosition();
    window.addEventListener("resize", updateTabPosition);
    return () => window.removeEventListener("resize", updateTabPosition);
  }, [hoveredTab, activeTab, queueWidth]);

  // ─── Filtered Tickets & Active Entities ────────────────────────────────────
  const heroIds = ["T-1042", "T-1048", "T-1055", "T-1061", "T-1067"];

  const filteredTickets = useMemo(() => {
    if (activeTab === "hero") {
      return tickets.filter((t) => heroIds.includes(t.id));
    }
    if (activeTab === "whatsapp") {
      return tickets.filter((t) => t.id.startsWith("T-WA"));
    }
    return tickets;
  }, [tickets, activeTab]);

  // Sync selection with available filtered tickets
  useEffect(() => {
    if (filteredTickets.length > 0) {
      if (!selectedId || !filteredTickets.some((t) => t.id === selectedId)) {
        setSelectedId(filteredTickets[0].id);
      }
    } else {
      setSelectedId("");
      setDetail(null);
      setEvents([]);
    }
  }, [filteredTickets, selectedId]);

  const isDetailMatching = Boolean(detail && detail.ticket && detail.ticket.id === selectedId);
  const selectedTicket = (isDetailMatching ? detail?.ticket : null) || tickets.find((t) => t.id === selectedId) || null;

  const primarySettlement =
    isDetailMatching && detail?.settlements && detail.settlements.length > 0
      ? detail.settlements[0]
      : fallbackLedger?.settlements && fallbackLedger.settlements.length > 0
      ? fallbackLedger.settlements[0]
      : null;

  const activeMerchant = (isDetailMatching && detail?.merchant) || fallbackLedger?.merchant;
  const activeMerchantId = selectedTicket?.merchant_id || activeMerchant?.id || "m_me";

  const isContradiction =
    selectedTicket?.status === "OPEN" &&
    primarySettlement?.status === "SUCCESS";

  const cannotAutoRetry =
    primarySettlement &&
    primarySettlement.status === "SUCCESS" &&
    selectedTicket?.status === "OPEN";

  // ─── Actions ───────────────────────────────────────────────────────────────

  const handleReset = async () => {
    try {
      const res = await fetch(getApiUrl("/api/demo/reset"), { method: "POST" });
      if (res.ok) {
        showToast("success", "Demo reset: tickets cleared, test ledger ready.");
        setSelectedId("");
        setDetail(null);
        setEvents([]);
        await Promise.all([fetchTickets(), fetchFallbackLedger()]);
      } else {
        showToast("error", "Reset failed");
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
        await Promise.all([fetchDetail(selectedId), fetchTickets(), fetchFallbackLedger()]);
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
      fetchFallbackLedger();
    }
  };

  const handleSetAmount = async () => {
    try {
      const amt = parseFloat(customAmount);
      const res = await fetch(getApiUrl("/api/demo/set-amount"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchant_id: activeMerchantId, amount: amt }),
      });
      if (res.ok) {
        showToast("success", `Amount updated to ₹${amt.toLocaleString("en-IN")}`);
        if (selectedId) await fetchDetail(selectedId);
        await Promise.all([fetchTickets(), fetchFallbackLedger()]);
      }
    } catch {
      showToast("error", "Failed to update amount.");
    }
  };

  const handleToggleFreeze = async () => {
    try {
      const res = await fetch(getApiUrl("/api/demo/toggle-freeze"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchant_id: activeMerchantId }),
      });
      if (res.ok) {
        const data = await res.json();
        showToast("info", data.risk_flag ? "Risk flag set: AML_SUSPECT" : "Risk flag cleared: Normal");
        if (selectedId) await fetchDetail(selectedId);
        await Promise.all([fetchTickets(), fetchFallbackLedger()]);
      }
    } catch {
      showToast("error", "Failed to toggle freeze.");
    }
  };

  const handleResetMerchant = async () => {
    try {
      const res = await fetch(getApiUrl("/api/demo/reset-merchant"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchant_id: activeMerchantId }),
      });
      if (res.ok) {
        showToast("success", `Active merchant ledger reset.`);
        if (selectedId) await fetchDetail(selectedId);
        await Promise.all([fetchTickets(), fetchFallbackLedger()]);
      }
    } catch {
      showToast("error", "Failed to reset merchant.");
    }
  };

  const handleSelectPreset = async (presetId: string) => {
    try {
      const res = await fetch(getApiUrl("/api/demo/preset"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preset: presetId }),
      });
      if (res.ok) {
        showToast("success", `Ledger preset applied: ${presetId}`);
        if (selectedId) await fetchDetail(selectedId);
        await Promise.all([fetchTickets(), fetchFallbackLedger()]);
      } else {
        showToast("error", "Failed to apply preset.");
      }
    } catch {
      showToast("error", "Network error applying preset.");
    }
  };

  const handleApprove = async () => {
    if (!selectedId) return;
    try {
      const res = await fetch(getApiUrl(`/api/tickets/${selectedId}/approve`), { method: "POST" });
      if (res.ok) {
        showToast("success", "Ticket approved & settlement confirmed.");
        await Promise.all([fetchDetail(selectedId), fetchTickets(), fetchFallbackLedger()]);
      } else {
        showToast("error", "Failed to approve ticket");
      }
    } catch {
      showToast("error", "Network error approving ticket");
    }
  };

  const handleReject = async () => {
    if (!selectedId) return;
    try {
      const res = await fetch(getApiUrl(`/api/tickets/${selectedId}/reject`), { method: "POST" });
      if (res.ok) {
        showToast("info", "Ticket rejected & merchant notified.");
        await Promise.all([fetchDetail(selectedId), fetchTickets(), fetchFallbackLedger()]);
      } else {
        showToast("error", "Failed to reject ticket");
      }
    } catch {
      showToast("error", "Network error rejecting ticket");
    }
  };

  const handleConfirmBatch = async () => {
    try {
      const res = await fetch(getApiUrl("/api/demo/confirm-settlement"), { method: "POST" });
      if (res.ok) {
        showToast("success", "Bank reconciliation received: batch confirmed to SUCCESS + UTR issued.");
        if (selectedId) await fetchDetail(selectedId);
        await Promise.all([fetchTickets(), fetchFallbackLedger()]);
      } else {
        showToast("error", "Failed to confirm batch");
      }
    } catch {
      showToast("error", "Network error confirming batch");
    }
  };

  // ─── Stations ──────────────────────────────────────────────────────────────
  const matchingEvents = isDetailMatching ? events : [];
  const understoodEv = matchingEvents.find((e) => e.type === "UNDERSTOOD");
  const recalledEv = matchingEvents.find((e) => e.type === "RECALLED");
  const decidedEv = matchingEvents.find((e) => e.type === "DECIDED");
  const actedEv = matchingEvents.find((e) => e.type === "ACTED");

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

  const heroCount = useMemo(() => tickets.filter((t) => heroIds.includes(t.id)).length, [tickets, heroIds]);
  const waCount = useMemo(
    () => tickets.filter((t) => t.id.startsWith("T-WA") || (t.channel === "WhatsApp" && !heroIds.includes(t.id))).length,
    [tickets, heroIds]
  );
  const allCount = tickets.length;

  const TAB_ITEMS = [
    { id: "hero", label: "Hero demo", count: heroCount },
    { id: "whatsapp", label: "WhatsApp live", count: waCount },
    { id: "all", label: "All", count: allCount },
  ] as const;

  return (
    <div className={`flex flex-col h-screen w-screen overflow-hidden bg-[#F5F7FB] text-[#1B1F3B] font-sans antialiased ${
      isDraggingLeft || isDraggingRight ? "select-none cursor-col-resize" : "select-none"
    }`}>
      {/* ─── Top Bar (40px Paytm Navy #002970) ─────────────────────────────── */}
      <header className="h-[40px] shrink-0 bg-[#002970] border-b border-[#00BAF2]/30 flex items-center justify-between px-4 z-20">
        {/* Left: Brand */}
        <div className="flex items-center gap-2">
          <img
            src="/favicon.svg"
            alt="Resolve OS"
            className="w-5 h-5 rounded object-contain shrink-0"
          />
          <span className="text-white font-medium text-[14px] tracking-tight">Resolve OS</span>
          <span className="text-white/70 text-xs font-normal">Merchant Support</span>
        </div>

        {/* Right: Telemetry Health Badges */}
        <div className="flex items-center gap-2 text-[11px] text-white/90 font-normal">
          <div className="flex items-center gap-1.5 h-7 px-2.5 rounded-[4px] bg-white/10 border border-white/15 shadow-sm" title="SQLite Database">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${apiError ? "bg-red-400" : "bg-emerald-400"}`} />
            <span className="hidden sm:inline font-medium">API</span>
          </div>
          <div className="flex items-center gap-1.5 h-7 px-2.5 rounded-[4px] bg-white/10 border border-white/15 shadow-sm" title={health?.sarvam === "live" ? "Sarvam 105B Live" : "Sarvam Fixture"}>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${health?.sarvam === "live" ? "bg-emerald-400" : "bg-amber-400"}`} />
            <span className="hidden sm:inline font-medium">Sarvam</span>
          </div>
          <div className="flex items-center gap-1.5 h-7 px-2.5 rounded-[4px] bg-white/10 border border-white/15 shadow-sm" title="Meta WhatsApp Cloud API">
            <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-emerald-400" />
            <span className="hidden sm:inline font-medium">WhatsApp</span>
          </div>
        </div>
      </header>

      {/* ─── NETRA-Inspired Forensic Architecture Flowchart Popover ───────── */}
      {showArchPopover && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-300 max-w-4xl w-full overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-[#002970] text-white">
              <div className="flex items-center gap-2.5">
                <img
                  src="/favicon.svg"
                  alt="Resolve OS"
                  className="size-6 rounded object-contain shrink-0"
                />
                <div>
                  <h3 className="font-medium text-sm text-white">Resolve OS Forensic Architecture Flowchart</h3>
                  <p className="text-[11px] text-white/70 font-normal">Multi-Modal Ops Teammate Engine &middot; Sarvam 105B &middot; Deterministic Policy</p>
                </div>
              </div>
              <button
                onClick={() => setShowArchPopover(false)}
                className="size-7 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition focus-visible:outline-none"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Dotted Canvas Body Inspired by NETRA Flowchart */}
            <div className="p-6 overflow-y-auto ros-dotted-canvas bg-slate-50/70 space-y-6 flex-1">
              {/* Slogan pill */}
              <div className="flex justify-center">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-[#00BAF2]/30 shadow-sm text-xs text-slate-800">
                  <span className="size-1.5 rounded-full bg-[#00BAF2] animate-pulse" />
                  <span className="font-medium">Core Axiom:</span>
                  <span className="text-slate-600">Hinglish ticket in &rarr; Sarvam proposes &rarr; rules read the ledger &rarr; one of three endings &rarr; audit.</span>
                </div>
              </div>

              {/* 5-Stage Connected Pipeline Grid */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-stretch relative">
                {/* Node 1: Ingress */}
                <div className="bg-white rounded-lg border border-slate-200 p-3.5 shadow-sm space-y-2 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">
                        INGRESS
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">&lt; 80ms</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-medium text-slate-900">
                      <Upload className="w-3.5 h-3.5 text-purple-600" />
                      <span>Inbound Gateway</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                      Meta WhatsApp webhook receiver + desk UI simulation intake.
                    </p>
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 pt-1 border-t border-slate-100">
                    Channel: WhatsApp / Direct
                  </div>
                </div>

                {/* Node 2: Sarvam */}
                <div className="bg-white rounded-lg border border-slate-200 p-3.5 shadow-sm space-y-2 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                        SARVAM 105B
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">~350ms</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-medium text-slate-900">
                      <Brain className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Hinglish Planner</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                      Interprets Hinglish nuance, extracts amounts, and proposes structured action JSON.
                    </p>
                  </div>
                  <div className="text-[10px] font-mono text-amber-700 pt-1 border-t border-slate-100 font-medium">
                    Proposes ONLY &middot; Zero fund rights
                  </div>
                </div>

                {/* Node 3: Memory */}
                <div className="bg-white rounded-lg border border-slate-200 p-3.5 shadow-sm space-y-2 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200">
                        MEMORY
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">120ms</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-medium text-slate-900">
                      <Database className="w-3.5 h-3.5 text-sky-600" />
                      <span>Ledger Memory</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                      Retrieves active merchant context, freeze flags, and past ticket resolutions.
                    </p>
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 pt-1 border-t border-slate-100">
                    SQLite + Stand-in Ledger
                  </div>
                </div>

                {/* Node 4: Policy Engine */}
                <div className="bg-white rounded-lg border-2 border-[#00BAF2] p-3.5 shadow-sm space-y-2 flex flex-col justify-between bg-cyan-50/20">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-300 font-bold">
                        POLICY ENGINE
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">45ms</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-medium text-slate-900">
                      <Sliders className="w-3.5 h-3.5 text-[#002970]" />
                      <span>Deterministic Rules</span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                      Zero-LLM Python rules. Enforces &le; &#8377;50k cap, 0 freeze flags, and &lt; 2 retries.
                    </p>
                  </div>
                  <div className="text-[10px] font-mono text-emerald-800 pt-1 border-t border-cyan-200 font-medium">
                    Issues SHA-256 Policy Token
                  </div>
                </div>

                {/* Node 5: Action Outpost */}
                <div className="bg-white rounded-lg border border-slate-200 p-3.5 shadow-sm space-y-2 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                        OUTPOST
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">Realtime</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-medium text-slate-900">
                      <SendHorizontal className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Bank &amp; WhatsApp</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                      Pushes settlement retry, updates ledger, and sends Meta WhatsApp response.
                    </p>
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 pt-1 border-t border-slate-100">
                    Immutable Audit Logged
                  </div>
                </div>
              </div>

              {/* 3 Endings Summary Bar */}
              <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-2">
                <span className="text-[10px] font-medium tracking-[0.06em] uppercase text-slate-400 block">
                  THE THREE POLICY ENDINGS
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-2.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-950">
                    <span className="font-semibold block">1. RESOLVED</span>
                    <span className="text-[11px] text-emerald-800">Settlement retry executed. Bank file updated. WhatsApp confirmation dispatched.</span>
                  </div>
                  <div className="p-2.5 rounded bg-amber-50 border border-amber-200 text-amber-950">
                    <span className="font-semibold block">2. WAITING ON MERCHANT</span>
                    <span className="text-[11px] text-amber-800">Ambiguity or missing 12-digit UTR. Asks merchant for details. Zero payouts made.</span>
                  </div>
                  <div className="p-2.5 rounded bg-red-50 border border-red-200 text-red-950">
                    <span className="font-semibold block">3. ESCALATED</span>
                    <span className="text-[11px] text-red-800">AML freeze or &gt; &#8377;50k. Compiles structured brief for human Risk Ops review.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Main 3-Column Ops Desk ──────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ═══════════════════════════════════════════════════════════════════
            COLUMN 1: Queue (Resizable width)
            ═══════════════════════════════════════════════════════════════════ */}
        <aside
          style={{ width: `${queueWidth}px` }}
          className="shrink-0 bg-white border-r border-[#E5E7EB] flex flex-col h-full overflow-hidden shadow-[2px_0_8px_-3px_rgba(0,41,112,0.04)] z-10"
        >
          {/* Header */}
          <div className="p-3 border-b border-[#E5E7EB] flex items-center justify-between shrink-0">
            <span className="font-medium text-[13px] text-[#002970]">Queue</span>
            <span className="text-[11px] font-normal text-slate-500">
              {filteredTickets.filter((t) => t.status === "OPEN").length} open &middot; {filteredTickets.length} total
            </span>
          </div>

          {/* Gliding Filter Tabs with Crisp Squaring & Proper Border */}
          <div className="p-2 border-b border-[#E5E7EB] bg-slate-50/70 shrink-0">
            <div
              ref={tabsContainerRef}
              onMouseLeave={() => setHoveredTab(null)}
              className="relative flex items-center p-1 rounded-lg bg-slate-200/70 border border-slate-300/80 text-xs font-medium select-none overflow-hidden shadow-inner h-9"
              aria-label="Queue Filter Tabs"
            >
              {/* The Gliding Indicator Pill with Crisp Squaring & Proper Border */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute z-0 rounded-[5px] bg-[#002970] border border-[#001f56] shadow-sm transition-all"
                style={{
                  left: tabPillStyle?.left ?? 0,
                  top: tabPillStyle?.top ?? 0,
                  width: tabPillStyle?.width ?? 0,
                  height: tabPillStyle?.height ?? 0,
                  opacity: tabPillStyle ? 1 : 0,
                  transition:
                    "left 200ms cubic-bezier(0.23, 1, 0.32, 1), width 200ms cubic-bezier(0.23, 1, 0.32, 1), opacity 150ms ease",
                }}
              />

              {TAB_ITEMS.map((tab) => {
                const isActive = activeTab === tab.id;
                const hasPill = (hoveredTab ?? activeTab) === tab.id;

                return (
                  <button
                    key={tab.id}
                    ref={(el) => { tabItemRefs.current[tab.id] = el; }}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    onMouseEnter={() => setHoveredTab(tab.id)}
                    className={`relative z-10 flex-1 h-7 whitespace-nowrap text-center text-xs font-medium rounded-[5px] transition-colors duration-150 flex items-center justify-center gap-1.5 px-2 focus-visible:outline-none cursor-pointer ${
                      hasPill ? "text-white font-medium" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {isActive && (
                      <span className="size-1.5 rounded-full bg-[#00BAF2] animate-pulse shrink-0" />
                    )}
                    <span className="whitespace-nowrap">{tab.label}</span>
                    <span
                      className={`shrink-0 px-1.5 py-0.5 rounded-[3px] text-[10px] font-semibold tabular-nums leading-none transition-colors ${
                        hasPill ? "bg-white/20 text-white" : "bg-slate-300/60 text-slate-600"
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Ticket List */}
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
              <div className="p-6 text-center text-xs text-slate-400 space-y-1.5 my-auto">
                <div className="font-medium text-slate-600">No tickets in this queue</div>
                <div className="text-[11px] text-slate-400">
                  Send a message to WhatsApp number +1 (555) 201-3457.
                </div>
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
                      <span className="font-mono text-[12.5px] font-semibold text-slate-800 tracking-tight">
                        {getTicketContact(ticket)}
                      </span>
                      {ticket.amount && Number(ticket.amount) > 0 ? (
                        <>
                          <span className="text-slate-400 font-sans font-normal mx-1">·</span>
                          <span className="text-[#002970] font-sans font-semibold">{formatRupees(ticket.amount)}</span>
                        </>
                      ) : null}
                    </div>

                    <div className="text-xs font-normal text-slate-500 truncate">
                      &ldquo;{ticket.text}&rdquo;
                    </div>

                    <div className="flex items-center justify-between text-[10px] font-medium text-slate-400 mt-0.5 tracking-[0.04em]">
                      <span>{ticket.channel}</span>
                      <span>{timeAgo(ticket.created_at)}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* ─── Column 1 / 2 Resizable Splitter (<->) ─── */}
        <div
          onPointerDown={handleLeftResizeStart}
          className={`ros-splitter ${isDraggingLeft ? "ros-splitter-active" : ""}`}
          title="Drag to resize Queue sidebar (<->)"
          role="separator"
          aria-orientation="vertical"
        >
          <div className="ros-grab-pill px-0.5 py-2 rounded bg-[#002970] text-white shadow-md flex items-center justify-center border border-[#00BAF2]/40">
            <GripVertical className="w-2.5 h-3 text-[#00BAF2]" />
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            COLUMN 2: Workspace (Fluid center column)
            ═══════════════════════════════════════════════════════════════════ */}
        <main className="flex-1 flex flex-col min-w-0 ros-ambient-canvas overflow-y-auto">
          {selectedTicket ? (
            <div className={`p-6 max-w-4xl w-full mx-auto space-y-4 transition-opacity duration-200 ${isDetailMatching || !detailLoading ? "opacity-100" : "opacity-80"}`}>
              {/* 3a. Case Header with Surface Elevation & Specular Top Accent */}
              <div className="ros-card-elevated rounded-xl p-5 relative overflow-hidden flex items-center justify-between gap-4 border border-slate-200/90">
                <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-gradient-to-r from-[#002970] via-[#00BAF2] to-transparent" />
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="text-lg font-bold text-[#002970] font-mono tracking-tight px-2.5 py-0.5 rounded-[4px] bg-[#002970]/5 border border-[#002970]/15">
                      {selectedTicket.id}
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className="text-base font-semibold text-slate-800">
                      {selectedTicket.intent || "Merchant Operations Dispute"}
                    </span>
                  </div>
                  <div className="text-xs font-normal text-slate-500 mt-1 flex items-center gap-1.5">
                    <span className="font-mono font-semibold text-slate-800">
                      {activeMerchant?.phone ? formatPhone(activeMerchant.phone) : (activeMerchant?.name || selectedTicket.merchant_name)}
                    </span>
                    {activeMerchant?.name && (
                      <>
                        <span>&middot;</span>
                        <span className="font-medium text-slate-700">{activeMerchant.name}</span>
                      </>
                    )}
                    <span>&middot;</span>
                    <span>{activeMerchant?.city || selectedTicket.merchant_city || "Delhi NCR"}</span>
                    <span>&middot;</span>
                    <span className="font-mono text-slate-400">{selectedTicket.merchant_id}</span>
                  </div>
                </div>

                {/* Primary Actions */}
                <div className="flex items-center gap-2.5 shrink-0">
                  {selectedTicket.status === "ESCALATED" && (
                    <>
                      <button
                        onClick={handleApprove}
                        className="h-8 px-3.5 rounded-[4px] text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white transition active:scale-95 flex items-center gap-1.5 shadow-sm"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Approve Override</span>
                      </button>
                      <button
                        onClick={handleReject}
                        className="h-8 px-3 rounded-[4px] text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition active:scale-95 flex items-center gap-1.5"
                      >
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>Reject Ticket</span>
                      </button>
                    </>
                  )}

                  {cannotAutoRetry ? (
                    <button
                      disabled
                      className="h-8 px-4 rounded-[4px] text-xs font-medium bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed flex items-center gap-1.5"
                    >
                      Run Resolve OS
                    </button>
                  ) : (
                    <button
                      onClick={handleRun}
                      disabled={isRunning}
                      className="h-8 px-4 rounded-[4px] text-xs font-medium bg-gradient-to-r from-[#002970] to-[#001f56] hover:from-[#001a4d] hover:to-[#00153a] text-white transition active:scale-95 flex items-center gap-2 border border-[#00BAF2]/40 shadow-[0_2px_8px_rgba(0,41,112,0.25)] hover:shadow-[0_4px_14px_rgba(0,186,242,0.3)] disabled:opacity-75 disabled:cursor-wait"
                    >
                      {isRunning ? (
                        <>
                          <RotateCcw className="w-3.5 h-3.5 animate-spin text-[#00BAF2]" />
                          <span>Running... ({elapsed.toFixed(1)}s)</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3 h-3 fill-[#00BAF2] text-[#00BAF2]" />
                          <span>{selectedTicket.status === "OPEN" ? "Run Resolve OS" : "Re-run Resolve OS"}</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* 3b. Merchant Message (Tactile Quote Bubble) */}
              <div className="ros-card rounded-xl p-4 shadow-sm border border-slate-200/90 space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2">
                    <div className="size-5 rounded-[4px] bg-[#002970]/10 flex items-center justify-center text-[#002970] font-bold text-[10px]">
                      <Phone className="size-2.5" />
                    </div>
                    <span className="text-xs font-semibold font-mono text-slate-800">
                      {detail?.merchant?.phone ? formatPhone(detail.merchant.phone) : (detail?.merchant?.name || selectedTicket.merchant_name)}
                    </span>
                    {detail?.merchant?.name && (
                      <span className="text-[11px] text-slate-500 font-sans font-normal">
                        ({detail.merchant.name})
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                    WhatsApp &middot; {timeAgo(selectedTicket.created_at)}
                  </span>
                </div>
                <div className="p-3.5 rounded-lg bg-slate-50/90 border-l-4 border-l-[#00BAF2] shadow-xs">
                  <p className="text-[13.5px] font-medium text-slate-800 leading-relaxed italic">
                    &ldquo;{selectedTicket.text}&rdquo;
                  </p>
                </div>
              </div>

              {/* 3c. Pipeline Strip (5 Luminous Stations) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between px-0.5">
                  <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider text-[11px]">
                    Telemetry Pipeline
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">
                    5-Stage Deterministic Orchestration
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-2.5">
                  {stations.map((st) => (
                    <div
                      key={st.num}
                      className={`p-3 rounded-xl border text-left flex flex-col justify-between min-h-[82px] transition-all duration-300 ease-in-out ${
                        st.active
                          ? "bg-gradient-to-b from-cyan-50/70 to-white border-[#00BAF2] ring-2 ring-[#00BAF2]/30 shadow-[0_0_12px_rgba(0,186,242,0.2)]"
                          : st.done
                          ? "bg-white border-emerald-300 shadow-xs"
                          : "bg-slate-50/80 border-slate-200/80"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded ${
                          st.done ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"
                        }`}>
                          0{st.num}
                        </span>
                        {st.done && (
                          <div className="size-4 rounded-full bg-emerald-50 border border-emerald-300 flex items-center justify-center">
                            <Check className="w-2.5 h-2.5 text-emerald-700" />
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-900 mt-1">
                          {st.name}
                        </div>
                        <div className="text-[10px] font-medium text-slate-500 truncate mt-0.5">
                          {st.val}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 3d. Outcome Banner */}
              {selectedTicket.status === "RESOLVED" && (
                <div className="p-4 bg-gradient-to-r from-emerald-50/90 via-white to-emerald-50/40 border border-emerald-300 rounded-xl text-emerald-950 flex items-center gap-3.5 shadow-[0_4px_16px_rgba(16,185,129,0.12)]">
                  <div className="size-9 rounded-lg bg-emerald-100 border border-emerald-300 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-5 h-5 text-emerald-700" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-emerald-900">RESOLVED · Settlement retried</div>
                    <div className="text-xs font-normal text-emerald-800 mt-0.5">
                      Batch re-pushed to bank file. Expected in merchant account within 2 hours.
                    </div>
                  </div>
                </div>
              )}

              {selectedTicket.status === "WAITING_ON_MERCHANT" && (
                <div className="p-4 bg-gradient-to-r from-amber-50/90 via-white to-amber-50/40 border border-amber-300 rounded-xl text-amber-950 flex items-center gap-3.5 shadow-[0_4px_16px_rgba(245,158,11,0.12)]">
                  <div className="size-9 rounded-lg bg-amber-100 border border-amber-300 flex items-center justify-center shrink-0">
                    <AlertCircle className="w-5 h-5 text-amber-700" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-amber-900">WAITING ON MERCHANT · UTR requested</div>
                    <div className="text-xs font-normal text-amber-800 mt-0.5">
                      Multiple matches in ledger. WhatsApp template sent requesting 12-digit UTR.
                    </div>
                  </div>
                </div>
              )}

              {selectedTicket.status === "ESCALATED" && (
                <div className="p-4 bg-gradient-to-r from-rose-50/90 via-white to-rose-50/40 border border-rose-300 rounded-xl text-rose-950 flex items-center gap-3.5 shadow-[0_4px_16px_rgba(244,63,94,0.12)]">
                  <div className="size-9 rounded-lg bg-rose-100 border border-rose-300 flex items-center justify-center shrink-0">
                    <ShieldAlert className="w-5 h-5 text-red-700" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-rose-900">ESCALATED · Risk Ops review</div>
                    <div className="text-xs font-normal text-rose-800 mt-0.5">
                      Deterministic policy blocked automated retry. Handed off to human queue with structured brief.
                    </div>
                  </div>
                </div>
              )}

              {/* 3e. Inbound / Outbound WhatsApp Timeline (Real WhatsApp Chat Cards) */}
              <div className="ros-card rounded-xl p-4 shadow-sm border border-slate-200/90 space-y-3.5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-[10px] font-bold tracking-[0.08em] text-slate-500 uppercase">
                    WhatsApp Thread (End-to-End Encrypted)
                  </span>
                  <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
                    <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Meta Cloud API Verified
                  </span>
                </div>

                <div className="space-y-3 max-w-xl">
                  {/* Inbound WhatsApp Message */}
                  <div className="bg-white border border-slate-200/80 rounded-2xl rounded-tl-sm p-3.5 text-xs text-slate-800 shadow-sm space-y-1">
                    <div className="text-[10px] font-semibold text-[#002970] flex items-center justify-between">
                      <span className="font-mono">{activeMerchant?.phone ? formatPhone(activeMerchant.phone) : (activeMerchant?.name || selectedTicket.merchant_name)}</span>
                      <span className="text-slate-400 font-normal">{timeAgo(selectedTicket.created_at)}</span>
                    </div>
                    <div className="text-[13px] leading-relaxed text-slate-800">{selectedTicket.text}</div>
                  </div>

                  {/* Outbound WhatsApp Message */}
                  {isDetailMatching && detail?.latest_whatsapp ? (
                    <div className="bg-[#E7F8E8] border border-emerald-200/70 rounded-2xl rounded-tr-sm p-3.5 text-xs text-slate-900 ml-6 shadow-sm space-y-1">
                      <div className="text-[10px] font-semibold text-emerald-800 flex items-center justify-between">
                        <span>Resolve OS Bot &middot; {detail.latest_whatsapp.template_id}</span>
                        <span className="text-emerald-700 font-bold tracking-wider">✓✓ DELIVERED</span>
                      </div>
                      <div className="text-[13px] leading-relaxed text-slate-900">{detail.latest_whatsapp.body}</div>
                    </div>
                  ) : detailLoading ? (
                    <div className="text-slate-400 text-xs italic pl-2 py-1 flex items-center gap-1.5">
                      <RotateCcw className="w-3 h-3 animate-spin text-[#00BAF2]" />
                      <span>Checking WhatsApp delivery status...</span>
                    </div>
                  ) : (
                    <div className="text-slate-400 text-xs italic pl-2 py-1">
                      No outbound message sent yet. Click &ldquo;Run Resolve OS&rdquo; to process and dispatch.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto space-y-4">
              <div className="w-12 h-12 rounded-full bg-[#002970]/10 flex items-center justify-center text-[#002970]">
                <MessageSquare className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <div className="text-base font-medium text-slate-800">
                  Awaiting Live Merchant Inquiries
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  The queue is live with zero seeded fake tickets. Send a real message to our WhatsApp business number.
                </p>
              </div>
              <div className="bg-white border border-[#E5E7EB] rounded-lg p-3.5 w-full text-left text-xs space-y-1.5 shadow-sm">
                <div className="flex items-center justify-between text-[10px] font-medium tracking-[0.06em] text-slate-400 uppercase">
                  <span>WHATSAPP SUPPORT CHANNEL</span>
                  <span className="text-emerald-600 font-mono">CONNECTED</span>
                </div>
                <div className="font-medium text-slate-800 text-sm font-mono">+1 (555) 201-3457</div>
                <div className="text-[11px] text-slate-500">
                  Auto-handled by Sarvam 105B &middot; Deterministic Policy &middot; Live Ledger
                </div>
              </div>
            </div>
          )}
        </main>

        {/* ─── Column 2 / 3 Resizable Splitter (<->) ─── */}
        <div
          onPointerDown={handleRightResizeStart}
          className={`ros-splitter ${isDraggingRight ? "ros-splitter-active" : ""}`}
          title="Drag to resize Forensics sidebar (<->)"
          role="separator"
          aria-orientation="vertical"
        >
          <div className="ros-grab-pill px-0.5 py-2 rounded bg-[#002970] text-white shadow-md flex items-center justify-center border border-[#00BAF2]/40">
            <GripVertical className="w-2.5 h-3 text-[#00BAF2]" />
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            COLUMN 3: Context Rail (Resizable width)
            ═══════════════════════════════════════════════════════════════════ */}
        <aside
          style={{ width: `${forensicWidth}px` }}
          className="shrink-0 bg-white/95 backdrop-blur-sm border-l border-[#E5E7EB] flex flex-col h-full overflow-y-auto p-4 space-y-4 shadow-[-2px_0_8px_-3px_rgba(0,41,112,0.04)] z-10"
        >
          {/* Card 1: Risk Ops Brief (JUMPS TO TOP IF ESCALATED) */}
          {detail?.human_brief && selectedTicket?.status === "ESCALATED" && (
            <div className="bg-rose-50/90 border border-rose-300/80 rounded-xl p-4 space-y-2 shadow-sm">
              <span className="text-[10px] font-bold tracking-[0.08em] uppercase text-rose-800 flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                Risk Ops Forensic Brief
              </span>
              <pre className="text-xs font-sans text-rose-950 whitespace-pre-wrap leading-relaxed font-normal bg-white/70 p-3 rounded-lg border border-rose-200">
                {detail.human_brief.brief_text}
              </pre>
            </div>
          )}

          {/* Card 2: Settlement Ledger (FIRST, ALWAYS) */}
          <div className="ros-card rounded-xl p-4 shadow-sm border border-slate-200/90 space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-[10px] font-bold tracking-[0.08em] uppercase text-slate-500">
                Settlement Ledger
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-300 tracking-wider">
                TEST DATA &middot; Live
              </span>
            </div>

            {primarySettlement ? (
              <div className="space-y-2 text-xs font-normal">
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-[#6B7280] uppercase text-[10px] font-medium tracking-[0.06em]">BATCH ID</span>
                  <span className="font-mono text-slate-900 font-medium">{primarySettlement.id}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 items-center">
                  <span className="text-[#6B7280] uppercase text-[10px] font-medium tracking-[0.06em]">AMOUNT</span>
                  <span className="text-sm font-bold text-[#002970] font-mono">
                    {formatRupees(primarySettlement.amount)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 items-center">
                  <span className="text-[#6B7280] uppercase text-[10px] font-medium tracking-[0.06em]">STATUS</span>
                  <span
                    className={`px-2 py-0.5 rounded-[4px] text-[10px] font-bold tracking-wide border ${
                      primarySettlement.status === "SUCCESS"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                        : primarySettlement.status === "FAILED"
                        ? "bg-rose-50 text-rose-700 border-rose-300"
                        : "bg-amber-50 text-amber-700 border-amber-300"
                    }`}
                  >
                    {primarySettlement.status}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 items-center">
                  <span className="text-[#6B7280] uppercase text-[10px] font-medium tracking-[0.06em]">RETRIES</span>
                  <span className="font-mono text-slate-700">{primarySettlement.retry_count || 0}/2</span>
                </div>
                {primarySettlement.utr && (
                  <div className="flex justify-between py-1 border-b border-slate-100 items-center">
                    <span className="text-[#6B7280] uppercase text-[10px] font-medium tracking-[0.06em]">BANK UTR</span>
                    <span className="font-mono text-emerald-700 font-semibold text-[11px]">{primarySettlement.utr}</span>
                  </div>
                )}
                {activeMerchant?.risk_flag && (
                  <div className="flex justify-between py-1 border-b border-slate-100 items-center">
                    <span className="text-rose-600 uppercase text-[10px] font-bold tracking-[0.06em]">COMPLIANCE FLAG</span>
                    <span className="font-mono text-rose-700 font-bold text-[11px]">{activeMerchant.risk_flag}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-slate-400 py-3 text-center text-xs">No active settlement on file</div>
            )}
          </div>

          {/* Card 3: Policy Verification (Only visible after run) */}
          {decidedEv && (
            <div className="ros-card rounded-xl p-4 shadow-sm border border-slate-200/90 space-y-2.5">
              <span className="text-[10px] font-bold tracking-[0.08em] uppercase text-slate-500 block border-b border-slate-100 pb-2">
                Policy Verification Rules
              </span>

              <div className="space-y-1.5 text-xs font-normal">
                <div className="flex items-center gap-1.5">
                  {primarySettlement && primarySettlement.amount < 50000 ? (
                    <span className="text-emerald-700 font-medium">✓ Amount &lt; ₹50,000 threshold</span>
                  ) : (
                    <span className="text-red-700 font-medium">✗ Amount ≥ ₹50,000 threshold</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {primarySettlement && primarySettlement.status === "INITIATED" ? (
                    <span className="text-emerald-700 font-medium">✓ Status INITIATED (Eligible)</span>
                  ) : primarySettlement?.status === "SUCCESS" ? (
                    <span className="text-red-700 font-medium">✗ Status is already SUCCESS</span>
                  ) : (
                    <span className="text-slate-600 font-medium">Status: {primarySettlement?.status || "—"}</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {primarySettlement && primarySettlement.retry_count < 2 ? (
                    <span className="text-emerald-700 font-medium">✓ Retry count &lt; 2 remaining</span>
                  ) : (
                    <span className="text-red-700 font-medium">✗ Retries exhausted</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {activeMerchant?.risk_flag || primarySettlement?.reason?.includes("FROZEN") ? (
                    <span className="text-red-700 font-medium">✗ Active AML freeze flag detected</span>
                  ) : (
                    <span className="text-emerald-700 font-medium">✓ No AML freeze / Clean ledger</span>
                  )}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">Decision</span>
                {decidedEv.payload?.action === "retry_settlement_file" ? (
                  <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold">
                    ALLOW RETRY
                  </span>
                ) : decidedEv.payload?.action === "ask_merchant_utr" ? (
                  <span className="px-2 py-0.5 rounded bg-amber-50 border border-amber-300 text-amber-800 text-xs font-bold">
                    ASK UTR
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded bg-rose-50 border border-rose-300 text-rose-800 text-xs font-bold">
                    ESCALATE RISK
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Card 3: Paytm Device Registry */}
          <div className="ros-card rounded-xl p-4 shadow-sm border border-slate-200/90 space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-[10px] font-bold tracking-[0.08em] uppercase text-slate-500">
                Device Registry
              </span>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
                Hardware
              </span>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between py-0.5">
                <span className="text-[#6B7280]">SOUNDBOX</span>
                <span className={`font-medium ${activeMerchant?.soundbox_status === "ONLINE" ? "text-emerald-600" : "text-amber-600"}`}>
                  {activeMerchant?.soundbox_status || "ONLINE"}
                </span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="text-[#6B7280]">QR STANDEE</span>
                <span className="font-medium text-emerald-600">{activeMerchant?.qr_status || "LIVE"}</span>
              </div>
            </div>
          </div>

          {/* Card 4: Audit Event Ledger (Real-time timeline) */}
          <div className="ros-card rounded-xl p-4 shadow-sm border border-slate-200/90 space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-[10px] font-bold tracking-[0.08em] uppercase text-slate-500">
                Audit Timeline
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                {events.length} records
              </span>
            </div>

            {events.length === 0 ? (
              <div className="text-slate-400 py-2 text-center text-xs">
                No events yet.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                {events.map((ev) => {
                  const actorMeta = getActorLabel(ev.actor);
                  return (
                    <div key={ev.id} className="text-xs border-b border-slate-200/50 pb-2">
                      <div className="flex items-center justify-between gap-1">
                        <span className={`px-1.5 py-0.2 rounded text-[9px] font-medium border ${actorMeta.color}`}>
                          {actorMeta.label}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {ev.ts ? ev.ts.slice(11, 19) : ""}
                        </span>
                      </div>
                      <div className="font-medium text-slate-800 text-[11.5px] mt-1 flex items-center justify-between">
                        <span>{ev.type}</span>
                        {ev.latency_ms ? (
                          <span className="text-[10px] text-slate-400 font-mono">{ev.latency_ms}ms</span>
                        ) : null}
                      </div>
                      {ev.reason_code && (
                        <div className="text-[11px] text-slate-600 font-normal mt-0.5 leading-snug">
                          {getPlainReason(ev.reason_code)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Card 5: Demo Tools (Collapsed behind toggle) */}
          <div className="ros-card rounded-xl shadow-sm border border-slate-200/90 overflow-hidden">
            <button
              onClick={() => setDemoToolsOpen(!demoToolsOpen)}
              className="w-full p-3.5 text-left flex items-center justify-between text-xs font-semibold text-slate-700 hover:bg-slate-50/80 transition"
            >
              <span className="flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-[#00BAF2]" />
                Operator Demo Tools &amp; Presets
              </span>
              {demoToolsOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
            </button>

            {demoToolsOpen && (
              <div className="p-3.5 border-t border-slate-100 space-y-3 bg-slate-50/50">
                {/* Presets Grid */}
                <div>
                  <span className="text-[10px] font-bold tracking-[0.06em] text-slate-500 uppercase block mb-1.5">
                    Ledger Presets
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { id: "L-OK", label: "L-OK (₹14.2k Valid)" },
                      { id: "L-PAID", label: "L-PAID (Already Paid)" },
                      { id: "L-BIG", label: "L-BIG (₹200k High)" },
                      { id: "L-FROZEN", label: "L-FROZEN (Account)" },
                      { id: "L-RISK", label: "L-RISK (AML Flag)" },
                      { id: "L-REFUND-AMBIG", label: "L-REFUND (Ambig)" },
                      { id: "L-REFUND-OK", label: "L-REFUND (1 Match)" },
                    ].map((p) => (
                      <button
                        key={p.id}
                        onClick={() => handleSelectPreset(p.id)}
                        className="h-7 px-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-[10.5px] font-medium truncate text-left transition shadow-2xs"
                        title={p.id}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-1.5 items-center pt-1 border-t border-slate-200/60">
                  <input
                    type="number"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    placeholder="200000"
                    className="flex-1 h-7 px-2.5 text-xs border border-slate-300 rounded-[4px] bg-white focus:outline-none focus:border-[#00BAF2] font-mono"
                  />
                  <button
                    onClick={handleSetAmount}
                    className="h-7 px-3 bg-slate-800 hover:bg-slate-900 text-white rounded-[4px] text-xs font-medium transition"
                  >
                    Set ₹
                  </button>
                </div>

                <button
                  onClick={handleConfirmBatch}
                  className="w-full h-8 px-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300/80 rounded-[4px] text-xs font-medium transition flex items-center justify-center gap-1.5 shadow-xs"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Bank Confirms Batch (Reconciliation)</span>
                </button>

                <button
                  onClick={handleToggleFreeze}
                  className="w-full h-7 px-2 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-[4px] text-xs font-medium transition"
                >
                  Toggle Freeze / AML Flag
                </button>

                <button
                  onClick={handleResetMerchant}
                  className="w-full h-7 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-[4px] text-xs font-medium transition"
                >
                  Reset Active Merchant
                </button>

                <div className="pt-2 border-t border-slate-200/80 flex flex-col gap-1.5">
                  <button
                    onClick={handleReset}
                    className="w-full h-7 px-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-[4px] text-xs font-medium transition flex items-center justify-center gap-1.5 shadow-xs"
                    title="Clear tickets and reset test ledger"
                  >
                    <RotateCcw className="w-3 h-3 text-[#002970]" />
                    <span>Reset Demo State &amp; Ledger</span>
                  </button>
                  <button
                    onClick={() => setShowArchPopover(true)}
                    className="w-full h-7 px-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-[4px] text-xs font-medium transition flex items-center justify-center gap-1.5 shadow-xs"
                    title="View Architecture Flowchart"
                  >
                    <HelpCircle className="w-3.5 h-3.5 text-[#002970]" />
                    <span>Architecture Flowchart</span>
                  </button>
                </div>
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

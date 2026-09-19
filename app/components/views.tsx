"use client";

import React, { useState, useMemo } from "react";
import {
  Users,
  CreditCard,
  ShieldCheck,
  BarChart3,
  Search,
  Filter,
  ArrowUpRight,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Clock,
  QrCode,
  Radio,
  Lock,
  RefreshCw,
  Sparkles,
  TrendingUp,
  FileText,
  BadgeAlert,
  HelpCircle,
  ExternalLink,
  ChevronRight,
  ShieldAlert,
  Cpu
} from "lucide-react";

interface ViewProps {
  onSelectMerchant?: (merchantId: string) => void;
  onSwitchToDesk: () => void;
}

// ─── 1. MERCHANT DIRECTORY VIEW ───────────────────────────────────────────────

interface MockMerchant {
  id: string;
  name: string;
  owner: string;
  phone: string;
  city: string;
  category: string;
  qrStatus: "LIVE" | "DAMAGED" | "PENDING";
  soundboxStatus: "ONLINE" | "OFFLINE" | "STANDBY";
  soundboxSerial: string;
  avgGmv: number;
  bankAccount: string;
  ifsc: string;
  riskFlag: string | null;
  kycStatus: "VERIFIED" | "IN_REVIEW";
  lastTicket: string | null;
}

const MOCK_MERCHANTS: MockMerchant[] = [
  {
    id: "m_me",
    name: "Sparsh Super Store",
    owner: "Sparsh Singh",
    phone: "+91 916306559332",
    city: "Delhi NCR",
    category: "Supermarket & Grocery",
    qrStatus: "LIVE",
    soundboxStatus: "ONLINE",
    soundboxSerial: "SBX-NCR-49021",
    avgGmv: 42500,
    bankAccount: "Paytm Payments Bank ···· 4921",
    ifsc: "PYTM0123456",
    riskFlag: null,
    kycStatus: "VERIFIED",
    lastTicket: "Settlement Inquiry (Live)"
  },
  {
    id: "m_2041",
    name: "Sharma Kirana Store",
    owner: "Ramesh Sharma",
    phone: "+91 98101 20410",
    city: "Karol Bagh, New Delhi",
    category: "Kirana & Provision",
    qrStatus: "LIVE",
    soundboxStatus: "ONLINE",
    soundboxSerial: "SBX-DEL-10294",
    avgGmv: 18400,
    bankAccount: "State Bank of India ···· 8102",
    ifsc: "SBIN0001245",
    riskFlag: null,
    kycStatus: "VERIFIED",
    lastTicket: "Settlement Auto-Resolved (₹14,280)"
  },
  {
    id: "m_2048",
    name: "Glow Beauty & Hair Salon",
    owner: "Pooja Verma",
    phone: "+91 98101 20480",
    city: "Lajpat Nagar, New Delhi",
    category: "Beauty & Wellness",
    qrStatus: "LIVE",
    soundboxStatus: "ONLINE",
    soundboxSerial: "SBX-DEL-88192",
    avgGmv: 12000,
    bankAccount: "HDFC Bank ···· 3910",
    ifsc: "HDFC0000240",
    riskFlag: null,
    kycStatus: "VERIFIED",
    lastTicket: "Refund UTR Clarification (₹850)"
  },
  {
    id: "m_2099",
    name: "Delhi Electronics World",
    owner: "Vikas Aggarwal",
    phone: "+91 98101 20990",
    city: "Nehru Place, New Delhi",
    category: "Consumer Electronics",
    qrStatus: "LIVE",
    soundboxStatus: "ONLINE",
    soundboxSerial: "SBX-DEL-99401",
    avgGmv: 95000,
    bankAccount: "ICICI Bank ···· 5821",
    ifsc: "ICIC0001024",
    riskFlag: "SUSPECT_ACCOUNT_FREEZE_AML",
    kycStatus: "IN_REVIEW",
    lastTicket: "Risk Escalation (₹1.84L Payout Blocked)"
  },
  {
    id: "m_2104",
    name: "Gupta Sweets & Bakers",
    owner: "Mahesh Gupta",
    phone: "+91 98101 21040",
    city: "Chandni Chowk, Old Delhi",
    category: "Restaurant & Sweets",
    qrStatus: "LIVE",
    soundboxStatus: "OFFLINE",
    soundboxSerial: "SBX-DEL-33829",
    avgGmv: 34000,
    bankAccount: "Punjab National Bank ···· 1120",
    ifsc: "PUNB0004921",
    riskFlag: null,
    kycStatus: "VERIFIED",
    lastTicket: "Soundbox Hardware Offline"
  },
  {
    id: "m_2115",
    name: "Aggarwal Supermart",
    owner: "Sunil Aggarwal",
    phone: "+91 98101 21150",
    city: "Rohini Sector 7, Delhi",
    category: "Supermarket",
    qrStatus: "DAMAGED",
    soundboxStatus: "ONLINE",
    soundboxSerial: "SBX-DEL-77210",
    avgGmv: 58000,
    bankAccount: "Axis Bank ···· 9042",
    ifsc: "UTIB0000412",
    riskFlag: null,
    kycStatus: "VERIFIED",
    lastTicket: "QR Standee Logistics Dispatch"
  },
  {
    id: "m_3092",
    name: "Bangalore Organic Cafe",
    owner: "Ananya Hegde",
    phone: "+91 99012 30920",
    city: "Indiranagar, Bengaluru",
    category: "Cafe & Dining",
    qrStatus: "LIVE",
    soundboxStatus: "ONLINE",
    soundboxSerial: "SBX-BLR-55910",
    avgGmv: 62000,
    bankAccount: "Kotak Mahindra Bank ···· 7731",
    ifsc: "KKBK0000812",
    riskFlag: null,
    kycStatus: "VERIFIED",
    lastTicket: "Routine Settlement Cleared"
  },
  {
    id: "m_4011",
    name: "Bandra Boutique & Fashion",
    owner: "Zoya Shaikh",
    phone: "+91 98200 40110",
    city: "Bandra West, Mumbai",
    category: "Apparel & Retail",
    qrStatus: "LIVE",
    soundboxStatus: "ONLINE",
    soundboxSerial: "SBX-MUM-12093",
    avgGmv: 48000,
    bankAccount: "HDFC Bank ···· 8840",
    ifsc: "HDFC0000060",
    riskFlag: null,
    kycStatus: "VERIFIED",
    lastTicket: "UPI Settlement Auto-Dispatched"
  }
];

export function MerchantDirectoryView({ onSwitchToDesk }: ViewProps) {
  const [search, setSearch] = useState("");
  const [filterRisk, setFilterRisk] = useState<"ALL" | "CLEAN" | "FLAGGED">("ALL");

  const filtered = useMemo(() => {
    return MOCK_MERCHANTS.filter((m) => {
      const matchSearch =
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        m.city.toLowerCase().includes(search.toLowerCase()) ||
        m.phone.includes(search) ||
        m.id.toLowerCase().includes(search.toLowerCase());
      const matchRisk =
        filterRisk === "ALL"
          ? true
          : filterRisk === "CLEAN"
          ? m.riskFlag === null
          : m.riskFlag !== null;
      return matchSearch && matchRisk;
    });
  }, [search, filterRisk]);

  return (
    <div className="space-y-6">
      {/* Top Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-lg border border-[#E5E7EB] shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-semibold text-[#002970] tracking-tight">
              Merchant Partner Directory
            </h1>
            <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-[#00BAF2]/10 text-[#002970] border border-[#00BAF2]/30">
              12,480 Active Partners
            </span>
          </div>
          <p className="text-xs text-[#6B7280] mt-1">
            Real-time KYC verification status, hardware IoT telemetry (Soundbox / QR Standee), and AML risk profiling.
          </p>
        </div>
        <button
          onClick={onSwitchToDesk}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#002970] hover:bg-[#001D52] rounded shadow-sm transition"
        >
          <span>Open Live Desk</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-lg border border-[#E5E7EB] shadow-sm">
          <div className="text-[11px] font-medium text-[#6B7280] uppercase tracking-wide">Soundbox Health</div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-semibold text-emerald-600">98.8%</span>
            <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">ONLINE</span>
          </div>
          <p className="text-[10px] text-[#9CA3AF] mt-0.5">12,330 devices heartbeat OK</p>
        </div>
        <div className="bg-white p-3.5 rounded-lg border border-[#E5E7EB] shadow-sm">
          <div className="text-[11px] font-medium text-[#6B7280] uppercase tracking-wide">QR Standees</div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-semibold text-[#002970]">99.4%</span>
            <span className="text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">LIVE ROUTING</span>
          </div>
          <p className="text-[10px] text-[#9CA3AF] mt-0.5">74 standee dispatch requests</p>
        </div>
        <div className="bg-white p-3.5 rounded-lg border border-[#E5E7EB] shadow-sm">
          <div className="text-[11px] font-medium text-[#6B7280] uppercase tracking-wide">AML / Risk Intercepts</div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-semibold text-amber-600">0.08%</span>
            <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">10 Flagged</span>
          </div>
          <p className="text-[10px] text-[#9CA3AF] mt-0.5">Auto-actions locked by policy</p>
        </div>
        <div className="bg-white p-3.5 rounded-lg border border-[#E5E7EB] shadow-sm">
          <div className="text-[11px] font-medium text-[#6B7280] uppercase tracking-wide">Avg Daily Settlement</div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-semibold text-[#002970]">₹38,450</span>
            <span className="text-[10px] text-[#6B7280]">per merchant</span>
          </div>
          <p className="text-[10px] text-[#9CA3AF] mt-0.5">T+1 auto-clearing at 06:00 AM</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-lg border border-[#E5E7EB]">
        <div className="relative w-full sm:w-80">
          <Search className="w-3.5 h-3.5 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by merchant, city, phone or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#F9FAFB] border border-[#E5E7EB] rounded focus:outline-none focus:ring-1 focus:ring-[#002970]"
          />
        </div>
        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          <span className="text-[11px] text-[#6B7280] font-medium mr-1">Risk Profile:</span>
          {(["ALL", "CLEAN", "FLAGGED"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setFilterRisk(r)}
              className={`px-2.5 py-1 text-[11px] rounded font-medium transition ${
                filterRisk === r
                  ? "bg-[#002970] text-white"
                  : "bg-[#F3F4F6] text-[#4B5563] hover:bg-[#E5E7EB]"
              }`}
            >
              {r === "ALL" ? "All Profiles" : r === "CLEAN" ? "Clean Ledger" : "AML Flagged"}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-[#E5E7EB] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F8FAFC] border-b border-[#E5E7EB] text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Merchant Profile</th>
                <th className="px-3 py-3">Location & Phone</th>
                <th className="px-3 py-3">Hardware Status</th>
                <th className="px-3 py-3">Settlement Account</th>
                <th className="px-3 py-3">Avg GMV</th>
                <th className="px-3 py-3">Risk Assessment</th>
                <th className="px-4 py-3 text-right">Support Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {filtered.map((m) => (
                <tr key={m.id} className="hover:bg-[#F9FAFB] transition">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-[#002970]/10 text-[#002970] font-semibold flex items-center justify-center text-xs shrink-0">
                        {m.name.charAt(0)}
                      </div>
                      <div>
                        <div className="font-medium text-[#111827] flex items-center gap-1.5">
                          <span>{m.name}</span>
                          {m.id === "m_me" && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-[#00BAF2] text-white">
                              DEMO SENDER
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[#6B7280] flex items-center gap-1.5">
                          <span>{m.id}</span>
                          <span>•</span>
                          <span>{m.category}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="text-[#1F2937] font-medium">{m.city}</div>
                    <div className="text-[11px] text-[#6B7280] font-mono">{m.phone}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="space-y-1 text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[#6B7280]">Soundbox:</span>
                        <span
                          className={`font-medium px-1.5 py-0.2 rounded text-[10px] ${
                            m.soundboxStatus === "ONLINE"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-red-50 text-red-700 border border-red-200"
                          }`}
                        >
                          {m.soundboxStatus}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[#6B7280]">QR Standee:</span>
                        <span
                          className={`font-medium px-1.5 py-0.2 rounded text-[10px] ${
                            m.qrStatus === "LIVE"
                              ? "bg-blue-50 text-blue-700 border border-blue-200"
                              : "bg-amber-50 text-amber-700 border border-amber-200"
                          }`}
                        >
                          {m.qrStatus}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="text-[#1F2937]">{m.bankAccount}</div>
                    <div className="text-[10px] text-[#9CA3AF] font-mono">IFSC: {m.ifsc}</div>
                  </td>
                  <td className="px-3 py-3 font-medium text-[#111827]">
                    ₹{m.avgGmv.toLocaleString("en-IN")}
                  </td>
                  <td className="px-3 py-3">
                    {m.riskFlag ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-800 border border-red-200">
                        <ShieldAlert className="w-3 h-3" />
                        <span>{m.riskFlag}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>KYC CLEAN</span>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={onSwitchToDesk}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-[#002970] bg-[#002970]/5 hover:bg-[#002970]/10 rounded transition"
                    >
                      <span>Inspect Desk</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── 2. SETTLEMENTS & PAYOUTS VIEW ───────────────────────────────────────────

interface MockSettlementBatch {
  id: string;
  merchantName: string;
  merchantId: string;
  amount: number;
  route: "PAYTM_BANK_IMPS" | "HDFC_NEFT" | "NPCI_RTGS" | "AXIS_IMPS";
  status: "SUCCESS" | "INITIATED" | "FAILED" | "RETRYING";
  utr: string | null;
  retryCount: number;
  reason: string;
  cycle: string;
  clearedAt: string;
  autoRecoverable: boolean;
}

const MOCK_SETTLEMENTS: MockSettlementBatch[] = [
  {
    id: "stl_me_01",
    merchantName: "Sparsh Super Store",
    merchantId: "m_me",
    amount: 14000,
    route: "PAYTM_BANK_IMPS",
    status: "INITIATED",
    utr: null,
    retryCount: 0,
    reason: "BANK_FILE_PENDING",
    cycle: "T+1 Daily Net Cycle",
    clearedAt: "Pending Trigger",
    autoRecoverable: true
  },
  {
    id: "stl_7781",
    merchantName: "Sharma Kirana Store",
    merchantId: "m_2041",
    amount: 14280,
    route: "PAYTM_BANK_IMPS",
    status: "SUCCESS",
    utr: "PAYTM1928374650",
    retryCount: 1,
    reason: "SETTLED_TO_BANK",
    cycle: "T+1 Daily Net Cycle",
    clearedAt: "Today 06:14 AM",
    autoRecoverable: false
  },
  {
    id: "stl_9902",
    merchantName: "Delhi Electronics World",
    merchantId: "m_2099",
    amount: 184000,
    route: "HDFC_NEFT",
    status: "FAILED",
    utr: null,
    retryCount: 0,
    reason: "ACCOUNT_FROZEN_SUSPECT",
    cycle: "Batch Cycle #B-902",
    clearedAt: "Blocked by Policy",
    autoRecoverable: false
  },
  {
    id: "stl_4011",
    merchantName: "Glow Beauty & Hair Salon",
    merchantId: "m_2048",
    amount: 8200,
    route: "PAYTM_BANK_IMPS",
    status: "SUCCESS",
    utr: "PYTM88102948201",
    retryCount: 0,
    reason: "COMPLETED",
    cycle: "T+1 Daily Net Cycle",
    clearedAt: "Today 06:00 AM",
    autoRecoverable: false
  },
  {
    id: "stl_8819",
    merchantName: "Gupta Sweets & Bakers",
    merchantId: "m_2104",
    amount: 32400,
    route: "PAYTM_BANK_IMPS",
    status: "SUCCESS",
    utr: "PYTM99201948102",
    retryCount: 0,
    reason: "SETTLED_TO_BANK",
    cycle: "T+1 Daily Net Cycle",
    clearedAt: "Today 06:02 AM",
    autoRecoverable: false
  },
  {
    id: "stl_9021",
    merchantName: "Aggarwal Supermart",
    merchantId: "m_2115",
    amount: 54100,
    route: "AXIS_IMPS",
    status: "SUCCESS",
    utr: "AXIS90812938102",
    retryCount: 0,
    reason: "SETTLED_TO_BANK",
    cycle: "T+1 Daily Net Cycle",
    clearedAt: "Today 06:01 AM",
    autoRecoverable: false
  },
  {
    id: "stl_9033",
    merchantName: "Bangalore Organic Cafe",
    merchantId: "m_3092",
    amount: 47900,
    route: "PAYTM_BANK_IMPS",
    status: "SUCCESS",
    utr: "PYTM48109283710",
    retryCount: 0,
    reason: "SETTLED_TO_BANK",
    cycle: "T+1 Daily Net Cycle",
    clearedAt: "Today 06:03 AM",
    autoRecoverable: false
  },
  {
    id: "stl_9045",
    merchantName: "Bandra Boutique & Fashion",
    merchantId: "m_4011",
    amount: 41200,
    route: "HDFC_NEFT",
    status: "SUCCESS",
    utr: "HDFC88192039102",
    retryCount: 0,
    reason: "SETTLED_TO_BANK",
    cycle: "T+1 Daily Net Cycle",
    clearedAt: "Today 06:04 AM",
    autoRecoverable: false
  }
];

export function SettlementsView({ onSwitchToDesk }: ViewProps) {
  const [tab, setTab] = useState<"ALL" | "SUCCESS" | "INITIATED" | "FAILED">("ALL");

  const filtered = useMemo(() => {
    if (tab === "ALL") return MOCK_SETTLEMENTS;
    return MOCK_SETTLEMENTS.filter((s) => s.status === tab);
  }, [tab]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-lg border border-[#E5E7EB] shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-semibold text-[#002970] tracking-tight">
              Bank Payouts & Net Settlement Ledger
            </h1>
            <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              Live Core Banking Clearing
            </span>
          </div>
          <p className="text-xs text-[#6B7280] mt-1">
            Automated T+1 settlement cycles, bank batch transmission logs, IMPS/NEFT UTR generation, and circuit breaker retry controls.
          </p>
        </div>
        <button
          onClick={onSwitchToDesk}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#002970] hover:bg-[#001D52] rounded shadow-sm transition"
        >
          <span>Run Resolve OS</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-lg border border-[#E5E7EB] shadow-sm">
          <div className="text-[11px] font-medium text-[#6B7280] uppercase tracking-wide">Total Volume Cleared</div>
          <div className="text-2xl font-bold text-[#002970] mt-1">₹1.84 Cr</div>
          <div className="text-[10px] text-emerald-600 font-medium mt-0.5">99.1% First-Pass Clearing</div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-[#E5E7EB] shadow-sm">
          <div className="text-[11px] font-medium text-[#6B7280] uppercase tracking-wide">Recovered by Resolve OS</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">₹14.28 Lakh</div>
          <div className="text-[10px] text-emerald-700 font-medium mt-0.5">Automated single-click retries</div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-[#E5E7EB] shadow-sm">
          <div className="text-[11px] font-medium text-[#6B7280] uppercase tracking-wide">Pending Bank Files</div>
          <div className="text-2xl font-bold text-amber-600 mt-1">₹28,280</div>
          <div className="text-[10px] text-amber-700 font-medium mt-0.5">2 batches awaiting retry</div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-[#E5E7EB] shadow-sm">
          <div className="text-[11px] font-medium text-[#6B7280] uppercase tracking-wide">Risk Blocked & Escalated</div>
          <div className="text-2xl font-bold text-red-600 mt-1">₹1,84,000</div>
          <div className="text-[10px] text-red-700 font-medium mt-0.5">High-value / AML lock</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-[#E5E7EB] pb-2">
        {(["ALL", "SUCCESS", "INITIATED", "FAILED"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-xs font-medium rounded transition ${
              tab === t
                ? "bg-[#002970] text-white shadow-sm"
                : "bg-white text-[#4B5563] border border-[#E5E7EB] hover:bg-[#F9FAFB]"
            }`}
          >
            {t === "ALL" ? "All Batches" : t === "SUCCESS" ? "Settled to Bank" : t === "INITIATED" ? "Pending / File Queued" : "Risk Escalated / Frozen"}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-[#E5E7EB] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F8FAFC] border-b border-[#E5E7EB] text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Batch & Merchant</th>
                <th className="px-3 py-3">Amount</th>
                <th className="px-3 py-3">Clearing Route</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">UTR Reference</th>
                <th className="px-3 py-3">Retries</th>
                <th className="px-3 py-3">Reason / Audit Code</th>
                <th className="px-4 py-3 text-right">Policy Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {filtered.map((s) => (
                <tr key={s.id} className="hover:bg-[#F9FAFB] transition">
                  <td className="px-4 py-3">
                    <div className="font-mono text-[11px] font-bold text-[#002970]">{s.id}</div>
                    <div className="font-medium text-[#111827]">{s.merchantName}</div>
                    <div className="text-[10px] text-[#6B7280]">{s.merchantId}</div>
                  </td>
                  <td className="px-3 py-3 font-semibold text-[#111827] text-sm">
                    ₹{s.amount.toLocaleString("en-IN")}
                  </td>
                  <td className="px-3 py-3">
                    <span className="font-mono text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
                      {s.route}
                    </span>
                    <div className="text-[10px] text-[#9CA3AF] mt-0.5">{s.cycle}</div>
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${
                        s.status === "SUCCESS"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : s.status === "INITIATED"
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : "bg-red-50 text-red-700 border border-red-200"
                      }`}
                    >
                      {s.status === "SUCCESS" ? (
                        <CheckCircle2 className="w-3 h-3" />
                      ) : s.status === "INITIATED" ? (
                        <Clock className="w-3 h-3" />
                      ) : (
                        <AlertTriangle className="w-3 h-3" />
                      )}
                      <span>{s.status}</span>
                    </span>
                  </td>
                  <td className="px-3 py-3 font-mono text-[11px]">
                    {s.utr ? (
                      <span className="text-emerald-700 font-medium">{s.utr}</span>
                    ) : (
                      <span className="text-[#9CA3AF] italic">Awaiting Clearance</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span className="text-[#4B5563] font-medium">{s.retryCount}/2</span>
                  </td>
                  <td className="px-3 py-3 font-mono text-[11px] text-[#4B5563]">
                    {s.reason}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {s.autoRecoverable ? (
                      <button
                        onClick={onSwitchToDesk}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded transition shadow-sm"
                      >
                        <Zap className="w-3 h-3" />
                        <span>Auto-Retry</span>
                      </button>
                    ) : s.status === "FAILED" ? (
                      <span className="text-[11px] text-red-600 font-medium">Escalated to Ops</span>
                    ) : (
                      <span className="text-[11px] text-emerald-600 font-medium">Reconciled</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── 3. POLICY ENGINE & GUARDRAIL CONSOLE ─────────────────────────────────────

export function PolicyConsoleView({ onSwitchToDesk }: ViewProps) {
  const [testTicketId, setTestTicketId] = useState("T-WA9801");
  const [testAction, setTestAction] = useState("retry_settlement_file");
  const [testReason, setTestReason] = useState("SETTLEMENT_RETRY_APPROVED");
  const [generatedToken, setGeneratedToken] = useState<string | null>("tok_f8a92b10");

  const handleSimulateToken = () => {
    // Generate deterministic sha256 simulation
    const raw = `${testTicketId}:${testAction}:${testReason}:${Date.now()}`;
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = (hash << 5) - hash + raw.charCodeAt(i);
      hash |= 0;
    }
    const hex = Math.abs(hash).toString(16).padStart(8, "0").slice(0, 8);
    setGeneratedToken(`tok_${hex}`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-lg border border-[#E5E7EB] shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-semibold text-[#002970] tracking-tight">
              Deterministic Policy Matrix & Guardrails
            </h1>
            <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-[#002970] text-white">
              Zero-Fund Rights LLM Guard
            </span>
          </div>
          <p className="text-xs text-[#6B7280] mt-1">
            Hardcoded, mathematically verified Python policy engine. The AI planner proposes; pure deterministic rules authorize or block write operations.
          </p>
        </div>
        <button
          onClick={onSwitchToDesk}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#002970] hover:bg-[#001D52] rounded shadow-sm transition"
        >
          <span>Test in Desk</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Rules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Rule 1 */}
        <div className="bg-white p-4 rounded-lg border border-[#E5E7EB] shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
              RULE POL-01
            </span>
            <span className="text-[10px] font-medium text-emerald-600 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> ACTIVE
            </span>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#111827]">Auto-Settlement Ceiling</h3>
            <p className="text-xs text-[#6B7280] mt-0.5">
              Maximum financial write allowance for automated bank file retries.
            </p>
          </div>
          <div className="p-2.5 bg-slate-50 rounded border border-slate-200 text-xs font-mono">
            <div className="text-[#6B7280]">Threshold Limit:</div>
            <div className="text-base font-bold text-[#002970]">≤ ₹50,000.00</div>
          </div>
          <p className="text-[11px] text-[#4B5563]">
            Batches above ₹50k (e.g. Delhi Electronics ₹1.84L) are instantly halted and escalated to Risk Ops with an automated 6-line brief.
          </p>
        </div>

        {/* Rule 2 */}
        <div className="bg-white p-4 rounded-lg border border-[#E5E7EB] shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
              RULE POL-02
            </span>
            <span className="text-[10px] font-medium text-emerald-600 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> ACTIVE
            </span>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#111827]">Circuit Breaker Retry Cap</h3>
            <p className="text-xs text-[#6B7280] mt-0.5">
              Prevents infinite retry storms on downstream bank file rejects.
            </p>
          </div>
          <div className="p-2.5 bg-slate-50 rounded border border-slate-200 text-xs font-mono">
            <div className="text-[#6B7280]">Maximum Allowed Retries:</div>
            <div className="text-base font-bold text-[#002970]">2 Retries Maximum</div>
          </div>
          <p className="text-[11px] text-[#4B5563]">
            When retry_count reaches 2, automated actions are permanently blocked. Reason code: <span className="font-mono text-[10px]">SETTLEMENT_RETRY_DENIED_RISK</span>.
          </p>
        </div>

        {/* Rule 3 */}
        <div className="bg-white p-4 rounded-lg border border-[#E5E7EB] shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
              RULE POL-03
            </span>
            <span className="text-[10px] font-medium text-emerald-600 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> ACTIVE
            </span>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#111827]">Refund Disambiguation (UTR Lock)</h3>
            <p className="text-xs text-[#6B7280] mt-0.5">
              Strict anti-hallucination guard against ambiguous customer refund claims.
            </p>
          </div>
          <div className="p-2.5 bg-slate-50 rounded border border-slate-200 text-xs font-mono">
            <div className="text-[#6B7280]">Verification Requirement:</div>
            <div className="text-base font-bold text-[#002970]">Exact 12-Digit UTR</div>
          </div>
          <p className="text-[11px] text-[#4B5563]">
            If multiple transactions match the complaint amount (e.g. Glow Salon 3x ₹850), the system asks for the UTR rather than guessing.
          </p>
        </div>

        {/* Rule 4 */}
        <div className="bg-white p-4 rounded-lg border border-[#E5E7EB] shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
              RULE POL-04
            </span>
            <span className="text-[10px] font-medium text-emerald-600 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> ACTIVE
            </span>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#111827]">AML & Freeze Lockdown</h3>
            <p className="text-xs text-[#6B7280] mt-0.5">
              Zero tolerance policy for compliance and law-enforcement flagged accounts.
            </p>
          </div>
          <div className="p-2.5 bg-slate-50 rounded border border-slate-200 text-xs font-mono">
            <div className="text-[#6B7280]">KYC Flagged Status:</div>
            <div className="text-base font-bold text-red-600">IMMEDIATE HALT</div>
          </div>
          <p className="text-[11px] text-[#4B5563]">
            If merchant has <span className="font-mono text-[10px]">ACCOUNT_FROZEN</span> or AML risk, all automated write tools are hard-isolated.
          </p>
        </div>

        {/* Rule 5 */}
        <div className="bg-white p-4 rounded-lg border border-[#E5E7EB] shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
              RULE POL-05
            </span>
            <span className="text-[10px] font-medium text-emerald-600 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> ACTIVE
            </span>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#111827]">Age Decay Window</h3>
            <p className="text-xs text-[#6B7280] mt-0.5">
              Settlement files must be within standard banking clearing cycle.
            </p>
          </div>
          <div className="p-2.5 bg-slate-50 rounded border border-slate-200 text-xs font-mono">
            <div className="text-[#6B7280]">Max Ledger Age:</div>
            <div className="text-base font-bold text-[#002970]">≤ 48 Hours</div>
          </div>
          <p className="text-[11px] text-[#4B5563]">
            Batches older than 48 hours require manual audit re-verification to prevent stale reconciliation collisions.
          </p>
        </div>

        {/* Rule 6 */}
        <div className="bg-white p-4 rounded-lg border border-[#E5E7EB] shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
              RULE POL-06
            </span>
            <span className="text-[10px] font-medium text-emerald-600 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> ACTIVE
            </span>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#111827]">Allowlisted WhatsApp Templates</h3>
            <p className="text-xs text-[#6B7280] mt-0.5">
              LLM is strictly prohibited from generating open freeform text to merchants.
            </p>
          </div>
          <div className="p-2.5 bg-slate-50 rounded border border-slate-200 text-xs font-mono">
            <div className="text-[#6B7280]">Channel Messaging:</div>
            <div className="text-base font-bold text-[#002970]">Strict Templates Only</div>
          </div>
          <p className="text-[11px] text-[#4B5563]">
            Pre-registered Meta Cloud API templates guarantee bank-compliant Hinglish wording with zero hallucinated promises.
          </p>
        </div>
      </div>

      {/* Interactive Token Simulator */}
      <div className="bg-white p-5 rounded-lg border border-[#E5E7EB] shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-[#002970]" />
            <h2 className="text-sm font-semibold text-[#111827]">
              Live SHA-256 Capability Token Inspector
            </h2>
          </div>
          <span className="text-[11px] text-[#6B7280]">Single-Use Cryptographic Capability Handle</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] font-medium text-[#6B7280]">Ticket ID</label>
            <input
              type="text"
              value={testTicketId}
              onChange={(e) => setTestTicketId(e.target.value)}
              className="mt-1 w-full text-xs font-mono p-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-[#6B7280]">Proposed Write Action</label>
            <select
              value={testAction}
              onChange={(e) => setTestAction(e.target.value)}
              className="mt-1 w-full text-xs p-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded"
            >
              <option value="retry_settlement_file">retry_settlement_file</option>
              <option value="request_refund">request_refund</option>
              <option value="send_whatsapp">send_whatsapp</option>
              <option value="escalate_ticket">escalate_ticket</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium text-[#6B7280]">Audit Reason Code</label>
            <select
              value={testReason}
              onChange={(e) => setTestReason(e.target.value)}
              className="mt-1 w-full text-xs p-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded"
            >
              <option value="SETTLEMENT_RETRY_APPROVED">SETTLEMENT_RETRY_APPROVED</option>
              <option value="REFUND_OK">REFUND_OK</option>
              <option value="ASK_MERCHANT_UTR">ASK_MERCHANT_UTR</option>
              <option value="ACCOUNT_FROZEN">ACCOUNT_FROZEN</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between bg-slate-50 p-3 rounded border border-slate-200">
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-[#4B5563]">Calculated Token:</span>
            <span className="font-mono text-xs font-bold text-[#002970] bg-white px-2.5 py-1 rounded border border-slate-300">
              {generatedToken}
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              VALID & SINGLE-USE
            </span>
          </div>
          <button
            onClick={handleSimulateToken}
            className="px-3 py-1 text-xs font-medium bg-[#002970] text-white hover:bg-[#001D52] rounded transition"
          >
            Re-generate Hash
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 4. ANALYTICS & ROI DASHBOARD VIEW ────────────────────────────────────────

export function AnalyticsView({ onSwitchToDesk }: ViewProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-lg border border-[#E5E7EB] shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-semibold text-[#002970] tracking-tight">
              Support Operations Velocity & ROI Analytics
            </h1>
            <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              Live Production Benchmarks
            </span>
          </div>
          <p className="text-xs text-[#6B7280] mt-1">
            End-to-end resolution latency, automation containment rate, BPO human cost reduction, and compliance safety metrics.
          </p>
        </div>
        <button
          onClick={onSwitchToDesk}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#002970] hover:bg-[#001D52] rounded shadow-sm transition"
        >
          <span>Open Live Desk</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Top 4 ROI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-lg border border-[#E5E7EB] shadow-sm">
          <div className="text-[11px] font-medium text-[#6B7280] uppercase tracking-wide">Autonomous Containment</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">84.6%</div>
          <div className="text-[10px] text-emerald-700 font-medium mt-0.5">1,420 of 1,678 resolved with 0 human touches</div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-[#E5E7EB] shadow-sm">
          <div className="text-[11px] font-medium text-[#6B7280] uppercase tracking-wide">Mean Resolution Time</div>
          <div className="text-2xl font-bold text-[#002970] mt-1">1.4s</div>
          <div className="text-[10px] text-emerald-700 font-medium mt-0.5">99.98% faster than 4.5h human SLA</div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-[#E5E7EB] shadow-sm">
          <div className="text-[11px] font-medium text-[#6B7280] uppercase tracking-wide">Weekly Cost Savings</div>
          <div className="text-2xl font-bold text-[#002970] mt-1">₹62,400</div>
          <div className="text-[10px] text-[#6B7280] font-medium mt-0.5">₹1.20 API cost vs ₹45.00 BPO rep cost</div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-[#E5E7EB] shadow-sm">
          <div className="text-[11px] font-medium text-[#6B7280] uppercase tracking-wide">False Payout Incident Rate</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">0.00%</div>
          <div className="text-[10px] text-emerald-700 font-medium mt-0.5">Zero unauthorized money movements</div>
        </div>
      </div>

      {/* Charts & Comparisons Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Intent Distribution */}
        <div className="bg-white p-5 rounded-lg border border-[#E5E7EB] shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#111827]">Merchant Inquiry Breakdown by Category</h3>
            <span className="text-[11px] text-[#6B7280]">Last 7 Days</span>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <div className="flex justify-between mb-1">
                <span className="font-medium text-[#1F2937]">Missing Settlement File (Daily Net Payout)</span>
                <span className="font-semibold text-[#002970]">52% (872 tickets)</span>
              </div>
              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-[#002970] rounded-full" style={{ width: "52%" }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="font-medium text-[#1F2937]">Customer UPI Refund & Disambiguation</span>
                <span className="font-semibold text-[#00BAF2]">26% (436 tickets)</span>
              </div>
              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-[#00BAF2] rounded-full" style={{ width: "26%" }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="font-medium text-[#1F2937]">Soundbox Audio Announcement / Offline</span>
                <span className="font-semibold text-amber-500">14% (235 tickets)</span>
              </div>
              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full" style={{ width: "14%" }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="font-medium text-[#1F2937]">QR Standee Physical Damage / Replacement</span>
                <span className="font-semibold text-purple-500">8% (135 tickets)</span>
              </div>
              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-purple-500 rounded-full" style={{ width: "8%" }} />
              </div>
            </div>
          </div>
        </div>

        {/* Latency Comparison */}
        <div className="bg-white p-5 rounded-lg border border-[#E5E7EB] shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#111827]">Speed Benchmark: Resolve OS vs Traditional Desk</h3>
            <span className="text-[11px] text-emerald-600 font-medium">99.98% Latency Drop</span>
          </div>

          <div className="space-y-4 pt-2">
            <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-emerald-800 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5" /> Resolve OS Autonomous Teammate
                </span>
                <span className="font-bold text-emerald-900 text-sm">1.4 Seconds</span>
              </div>
              <div className="text-[10px] text-emerald-700 mt-1">
                Sarvam intent parsing + Deterministic guardrails + Bank retry + Meta WhatsApp delivery.
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex justify-between items-center text-xs">
                <span className="font-medium text-[#4B5563]">Traditional Human L1 Support BPO</span>
                <span className="font-bold text-slate-700 text-sm">4.5 Hours (16,200s)</span>
              </div>
              <div className="text-[10px] text-[#6B7280] mt-1">
                Queue waiting time, manual SQL ledger lookups, supervisor sign-offs, and manual customer SMS typing.
              </div>
            </div>

            <div className="text-xs text-[#6B7280] leading-relaxed pt-1">
              💡 By handling routine bank file retries and UTR collection autonomously, tier-1 BPO load is cut by 84%, allowing human operations to focus entirely on fraud investigations and complex merchant queries.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

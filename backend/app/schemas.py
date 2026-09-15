"""
Pydantic schemas for ResolveOS.
Minimal, type-safe structures for API contracts and partner payloads.
"""
from typing import List, Optional, Any, Dict
from pydantic import BaseModel, Field

class PlanAction(BaseModel):
    action: str
    args: Dict[str, Any] = Field(default_factory=dict)
    why: Optional[str] = None

class PlanRead(BaseModel):
    tool: str
    args: Dict[str, Any] = Field(default_factory=dict)

class SarvamPlan(BaseModel):
    intent: str
    confidence: float = 0.9
    summary_en: str
    summary_hi: str
    proposed_reads: List[PlanRead] = Field(default_factory=list)
    proposed_writes: List[PlanAction] = Field(default_factory=list)
    needs_human: bool = False
    human_reason: Optional[str] = None

class PolicyDecision(BaseModel):
    allowed: bool
    action: str
    reason_code: str
    policy_token: str
    explanation: str
    next_ticket_status: str # RESOLVED, WAITING_ON_MERCHANT, ESCALATED
    args: Dict[str, Any] = Field(default_factory=dict)

class RunResponse(BaseModel):
    ticket_id: str
    status: str
    reason_code: str
    n8n_execution_id: str
    events_count: int

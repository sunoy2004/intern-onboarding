from pydantic import BaseModel

from schemas.approval import ApprovalRead


class HITLPendingRead(BaseModel):
    approval: ApprovalRead
    candidate_name: str | None = None
    candidate_email: str | None = None


class HITLResolveRequest(BaseModel):
    decision: str  # "approved" or "rejected"
    notes: str | None = None

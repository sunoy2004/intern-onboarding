from datetime import datetime

from pydantic import BaseModel

from models.approval import ApprovalStatus
from schemas.task import TaskRead


class ApprovalRead(BaseModel):
    id: int
    task_id: int
    action_type: str
    payload: dict
    status: ApprovalStatus
    approver_role: str
    approver_id: int | None
    notes: str | None
    created_at: datetime
    resolved_at: datetime | None
    task: TaskRead | None = None

    model_config = {"from_attributes": True}


class ApprovalResolve(BaseModel):
    decision: str  # "approved" or "rejected"
    notes: str | None = None

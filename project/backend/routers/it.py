from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from middleware.rbac import require_roles
from models.user import User
from models.candidate import Candidate, CandidateStatus
from models.approval import Approval, ApprovalStatus
from models.provisioning import ProvisioningLog
from schemas.candidate import CandidateRead
from schemas.approval import ApprovalRead

router = APIRouter(prefix="/it", tags=["it"])


@router.get("/provisioning")
async def list_provisioning(
    current_user: User = Depends(require_roles("it", "admin")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(ProvisioningLog).order_by(ProvisioningLog.provisioned_at.desc()))
    logs = result.scalars().all()
    return [
        {
            "id": log.id,
            "candidate_id": log.candidate_id,
            "resource_type": log.resource_type.value,
            "resource_value": log.resource_value,
            "provisioned_at": log.provisioned_at.isoformat() if log.provisioned_at else None,
            "provisioned_by_agent": log.provisioned_by_agent,
        }
        for log in logs
    ]


@router.get("/candidates", response_model=list[CandidateRead])
async def list_it_candidates(
    current_user: User = Depends(require_roles("it", "admin")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Candidate).where(Candidate.status == CandidateStatus.it_provisioning)
    )
    candidates = result.scalars().all()
    return [CandidateRead.model_validate(c) for c in candidates]


@router.get("/approvals/pending", response_model=list[ApprovalRead])
async def list_pending_approvals(
    current_user: User = Depends(require_roles("it", "admin")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Approval).where(
            Approval.approver_role == "it",
            Approval.status == ApprovalStatus.pending,
        ).order_by(Approval.created_at.desc())
    )
    approvals = result.scalars().all()
    return [ApprovalRead.model_validate(a) for a in approvals]

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from middleware.rbac import require_roles
from models.user import User
from models.candidate import Candidate
from models.approval import Approval, ApprovalStatus
from models.onboarding_task import OnboardingTask, TaskStatus
from models.audit import AuditLog
from schemas.approval import ApprovalRead
from schemas.hitl import HITLPendingRead, HITLResolveRequest

router = APIRouter(prefix="/hitl", tags=["hitl"])


@router.get("/pending", response_model=list[HITLPendingRead])
async def list_pending_approvals(
    current_user: User = Depends(require_roles("hr", "it", "admin")),
    db: AsyncSession = Depends(get_db),
):
    query = select(Approval).where(Approval.status == ApprovalStatus.pending)
    if current_user.role.value != "admin":
        query = query.where(Approval.approver_role == current_user.role.value)
    query = query.order_by(Approval.created_at.desc())

    result = await db.execute(query)
    approvals = result.scalars().all()

    items = []
    for approval in approvals:
        task = approval.task
        candidate = None
        candidate_name = None
        candidate_email = None

        if task:
            r = await db.execute(select(Candidate).where(Candidate.id == task.candidate_id))
            candidate = r.scalar_one_or_none()
            if candidate and candidate.user:
                candidate_name = candidate.user.name
                candidate_email = candidate.user.email

        items.append(HITLPendingRead(
            approval=ApprovalRead.model_validate(approval),
            candidate_name=candidate_name,
            candidate_email=candidate_email,
        ))

    return items


@router.get("/{approval_id}", response_model=ApprovalRead)
async def get_approval(
    approval_id: int,
    current_user: User = Depends(require_roles("hr", "it", "admin")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Approval).where(Approval.id == approval_id))
    approval = result.scalar_one_or_none()
    if not approval:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Approval not found")
    return ApprovalRead.model_validate(approval)


@router.post("/{approval_id}/resolve")
async def resolve_approval(
    approval_id: int,
    body: HITLResolveRequest,
    current_user: User = Depends(require_roles("hr", "it", "admin")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Approval).where(Approval.id == approval_id))
    approval = result.scalar_one_or_none()
    if not approval:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Approval not found")

    if approval.status != ApprovalStatus.pending:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Approval already resolved")

    if approval.approver_role != current_user.role.value and current_user.role.value != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to resolve this approval")

    if body.decision not in ("approved", "rejected"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Decision must be 'approved' or 'rejected'")

    approval.status = ApprovalStatus(body.decision)
    approval.approver_id = current_user.id
    approval.notes = body.notes
    approval.resolved_at = datetime.now(timezone.utc)

    if approval.task:
        if body.decision == "approved":
            approval.task.status = TaskStatus.completed
        else:
            approval.task.status = TaskStatus.failed

    audit = AuditLog(
        user_id=current_user.id,
        action=f"resolve_approval_{body.decision}",
        entity_type="approval",
        entity_id=approval.id,
        details={"decision": body.decision, "notes": body.notes, "action_type": approval.action_type},
    )
    db.add(audit)
    await db.commit()
    await db.refresh(approval)

    # Resume workflow if approved
    if body.decision == "approved" and approval.task:
        try:
            from agents.orchestrator import resume_workflow
            await resume_workflow(approval.task.candidate_id, body.decision, db)
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Failed to resume workflow: {e}")

    return {
        "approval_id": approval.id,
        "decision": body.decision,
        "action_type": approval.action_type,
        "workflow_resumed": body.decision == "approved",
    }

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from middleware.rbac import require_roles
from models.user import User
from models.candidate import Candidate, CandidateStatus
from models.document import Document, DocStatus
from models.approval import Approval, ApprovalStatus
from models.onboarding_task import OnboardingTask, TaskStatus
from schemas.candidate import CandidateRead
from schemas.document import DocumentRead
from schemas.approval import ApprovalRead

router = APIRouter(prefix="/hr", tags=["hr"])


@router.get("/candidates", response_model=list[CandidateRead])
async def list_candidates(
    status_filter: str | None = None,
    current_user: User = Depends(require_roles("hr", "admin")),
    db: AsyncSession = Depends(get_db),
):
    query = select(Candidate)
    if status_filter:
        try:
            cs = CandidateStatus(status_filter)
            query = query.where(Candidate.status == cs)
        except ValueError:
            pass
    result = await db.execute(query.order_by(Candidate.created_at.desc()))
    candidates = result.scalars().all()
    return [CandidateRead.model_validate(c) for c in candidates]


@router.get("/candidates/{candidate_id}", response_model=CandidateRead)
async def get_candidate(
    candidate_id: int,
    current_user: User = Depends(require_roles("hr", "admin")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Candidate).where(Candidate.id == candidate_id))
    candidate = result.scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
    return CandidateRead.model_validate(candidate)


@router.get("/candidates/{candidate_id}/documents", response_model=list[DocumentRead])
async def get_candidate_documents(
    candidate_id: int,
    current_user: User = Depends(require_roles("hr", "admin")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Document).where(Document.candidate_id == candidate_id))
    docs = result.scalars().all()
    return [DocumentRead.model_validate(d) for d in docs]


@router.post("/candidates/{candidate_id}/start-onboarding")
async def start_onboarding(
    candidate_id: int,
    current_user: User = Depends(require_roles("hr", "admin")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Candidate).where(Candidate.id == candidate_id))
    candidate = result.scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    task = OnboardingTask(
        candidate_id=candidate.id,
        agent_name="orchestrator",
        task_type="full_onboarding",
        status=TaskStatus.in_progress,
        payload={"initiated_by": current_user.id, "initiated_at": datetime.now(timezone.utc).isoformat()},
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)

    try:
        from agents.orchestrator import run_onboarding_workflow
        await run_onboarding_workflow(candidate.id, task.id, db)
    except Exception as e:
        task.status = TaskStatus.failed
        task.result = {"error": str(e)}
        await db.commit()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Workflow failed: {e}")

    return {"task_id": task.id, "message": "Onboarding workflow started", "candidate_id": candidate.id}


@router.post("/documents/{doc_id}/reject")
async def reject_document(
    doc_id: int,
    reason: str,
    current_user: User = Depends(require_roles("hr", "admin")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    doc.status = DocStatus.rejected
    doc.rejection_reason = reason
    await db.commit()

    return {"message": "Document rejected", "document_id": doc_id, "reason": reason}


@router.get("/approvals/pending", response_model=list[ApprovalRead])
async def list_pending_approvals(
    current_user: User = Depends(require_roles("hr", "admin")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Approval).where(
            Approval.approver_role == "hr",
            Approval.status == ApprovalStatus.pending,
        ).order_by(Approval.created_at.desc())
    )
    approvals = result.scalars().all()
    return [ApprovalRead.model_validate(a) for a in approvals]

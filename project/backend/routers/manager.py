from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from middleware.rbac import require_roles
from models.user import User
from models.candidate import Candidate
from models.document import Document
from models.training import TrainingProgress, TrainingStatus
from schemas.candidate import CandidateRead

router = APIRouter(prefix="/manager", tags=["manager"])


@router.get("/team", response_model=list[CandidateRead])
async def list_team(
    department: str | None = None,
    current_user: User = Depends(require_roles("manager", "admin")),
    db: AsyncSession = Depends(get_db),
):
    query = select(Candidate)
    if department:
        query = query.where(Candidate.department == department)
    result = await db.execute(query.order_by(Candidate.created_at.desc()))
    candidates = result.scalars().all()
    return [CandidateRead.model_validate(c) for c in candidates]


@router.get("/team/{candidate_id}/progress")
async def get_team_member_progress(
    candidate_id: int,
    current_user: User = Depends(require_roles("manager", "admin")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Candidate).where(Candidate.id == candidate_id))
    candidate = result.scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    result = await db.execute(select(Document).where(Document.candidate_id == candidate.id))
    docs = result.scalars().all()

    result = await db.execute(
        select(TrainingProgress).where(TrainingProgress.candidate_id == candidate.id)
    )
    training = result.scalars().all()
    training_total = len(training)
    training_completed = sum(1 for t in training if t.status == TrainingStatus.completed)

    return {
        "candidate": CandidateRead.model_validate(candidate),
        "documents": [
            {"doc_type": d.doc_type.value, "status": d.status.value, "ocr_confidence": d.ocr_confidence}
            for d in docs
        ],
        "training_total": training_total,
        "training_completed": training_completed,
        "training_progress_pct": round((training_completed / training_total) * 100) if training_total > 0 else 0,
    }

import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from database import get_db
from dependencies import get_current_active_user
from middleware.rbac import require_roles
from models.user import User, UserRole
from models.candidate import Candidate, CandidateStatus
from models.document import Document, DocType, DocStatus
from models.training import TrainingProgress, TrainingStatus
from schemas.candidate import CandidateRead
from schemas.document import DocumentRead

router = APIRouter(prefix="/candidates", tags=["candidate"])
settings = get_settings()


async def get_candidate_for_user(current_user: User, db: AsyncSession) -> Candidate:
    result = await db.execute(select(Candidate).where(Candidate.user_id == current_user.id))
    candidate = result.scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate profile not found")
    return candidate


@router.get("/me", response_model=CandidateRead)
async def get_my_profile(
    current_user: User = Depends(require_roles("candidate")),
    db: AsyncSession = Depends(get_db),
):
    candidate = await get_candidate_for_user(current_user, db)
    return CandidateRead.model_validate(candidate)


@router.post("/documents/upload", response_model=DocumentRead)
async def upload_document(
    doc_type: DocType = Form(...),
    file: UploadFile = File(...),
    current_user: User = Depends(require_roles("candidate")),
    db: AsyncSession = Depends(get_db),
):
    candidate = await get_candidate_for_user(current_user, db)

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    ext = os.path.splitext(file.filename or "upload")[1]
    filename = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(settings.UPLOAD_DIR, filename)

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    doc = Document(
        candidate_id=candidate.id,
        doc_type=doc_type,
        file_path=file_path,
        original_filename=file.filename or filename,
        status=DocStatus.uploaded,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    return DocumentRead.model_validate(doc)


@router.get("/documents", response_model=list[DocumentRead])
async def list_my_documents(
    current_user: User = Depends(require_roles("candidate")),
    db: AsyncSession = Depends(get_db),
):
    candidate = await get_candidate_for_user(current_user, db)
    result = await db.execute(select(Document).where(Document.candidate_id == candidate.id))
    docs = result.scalars().all()
    return [DocumentRead.model_validate(d) for d in docs]


@router.get("/training")
async def list_my_training(
    current_user: User = Depends(require_roles("candidate")),
    db: AsyncSession = Depends(get_db),
):
    from schemas.training import TrainingProgressRead
    candidate = await get_candidate_for_user(current_user, db)
    result = await db.execute(
        select(TrainingProgress).where(TrainingProgress.candidate_id == candidate.id)
    )
    progress = result.scalars().all()
    return [TrainingProgressRead.model_validate(p) for p in progress]


@router.post("/training/{module_id}/complete")
async def complete_training_module(
    module_id: int,
    current_user: User = Depends(require_roles("candidate")),
    db: AsyncSession = Depends(get_db),
):
    from models.training import TrainingModule
    candidate = await get_candidate_for_user(current_user, db)

    result = await db.execute(
        select(TrainingProgress).where(
            TrainingProgress.candidate_id == candidate.id,
            TrainingProgress.module_id == module_id,
        )
    )
    progress = result.scalar_one_or_none()
    if not progress:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Training module not assigned")

    progress.status = TrainingStatus.completed
    progress.completed_at = datetime.now(timezone.utc)
    if not progress.started_at:
        progress.started_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(progress)

    return {"message": "Training module completed", "module_id": module_id}


@router.get("/status")
async def get_my_status(
    current_user: User = Depends(require_roles("candidate")),
    db: AsyncSession = Depends(get_db),
):
    candidate = await get_candidate_for_user(current_user, db)

    status_order = [
        CandidateStatus.applied,
        CandidateStatus.documents_pending,
        CandidateStatus.documents_submitted,
        CandidateStatus.documents_verified,
        CandidateStatus.it_provisioning,
        CandidateStatus.training,
        CandidateStatus.onboarded,
    ]
    try:
        current_idx = status_order.index(candidate.status)
    except ValueError:
        current_idx = 0

    percentage = round((current_idx / (len(status_order) - 1)) * 100) if candidate.status != CandidateStatus.rejected else 0

    result = await db.execute(select(Document).where(Document.candidate_id == candidate.id))
    docs = result.scalars().all()
    doc_statuses = {d.doc_type.value: d.status.value for d in docs}

    result = await db.execute(
        select(TrainingProgress).where(TrainingProgress.candidate_id == candidate.id)
    )
    training = result.scalars().all()
    training_total = len(training)
    training_completed = sum(1 for t in training if t.status == TrainingStatus.completed)

    return {
        "status": candidate.status.value,
        "percentage": percentage,
        "documents": doc_statuses,
        "training_total": training_total,
        "training_completed": training_completed,
        "department": candidate.department,
        "job_title": candidate.job_title,
        "employee_id": candidate.employee_id,
        "work_email": candidate.work_email,
    }

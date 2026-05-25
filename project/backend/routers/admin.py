from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from passlib.context import CryptContext
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_active_user
from middleware.rbac import require_roles
from models.user import User, UserRole
from models.candidate import Candidate, CandidateStatus
from models.approval import Approval, ApprovalStatus
from models.audit import AuditLog
from models.onboarding_task import OnboardingTask, TaskStatus
from models.training import TrainingModule
from schemas.user import UserCreate, UserRead
from schemas.training import TrainingModuleCreate, TrainingModuleRead

router = APIRouter(prefix="/admin", tags=["admin"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


@router.get("/users", response_model=list[UserRead])
async def list_users(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    offset = (page - 1) * size
    result = await db.execute(select(User).offset(offset).limit(size).order_by(User.id))
    users = result.scalars().all()
    return [UserRead.model_validate(u) for u in users]


@router.post("/users", response_model=UserRead)
async def create_user(
    body: UserCreate,
    current_user: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    hashed_password = pwd_context.hash(body.password)
    user = User(
        name=body.name,
        email=body.email,
        hashed_password=hashed_password,
        role=body.role,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    audit = AuditLog(
        user_id=current_user.id,
        action="create_user",
        entity_type="user",
        entity_id=user.id,
        details={"created_user_role": user.role.value},
    )
    db.add(audit)
    await db.commit()

    return UserRead.model_validate(user)


@router.put("/users/{user_id}", response_model=UserRead)
async def update_user(
    user_id: int,
    name: str | None = None,
    email: str | None = None,
    role: UserRole | None = None,
    is_active: bool | None = None,
    current_user: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if name is not None:
        user.name = name
    if email is not None:
        user.email = email
    if role is not None:
        user.role = role
    if is_active is not None:
        user.is_active = is_active

    await db.commit()
    await db.refresh(user)

    audit = AuditLog(
        user_id=current_user.id,
        action="update_user",
        entity_type="user",
        entity_id=user.id,
    )
    db.add(audit)
    await db.commit()

    return UserRead.model_validate(user)


@router.delete("/users/{user_id}")
async def deactivate_user(
    user_id: int,
    current_user: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.is_active = False
    audit = AuditLog(
        user_id=current_user.id,
        action="deactivate_user",
        entity_type="user",
        entity_id=user.id,
    )
    db.add(audit)
    await db.commit()

    return {"message": "User deactivated", "user_id": user_id}


@router.get("/audit")
async def get_audit_log(
    user_id: int | None = None,
    action: str | None = None,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    current_user: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    query = select(AuditLog)
    if user_id:
        query = query.where(AuditLog.user_id == user_id)
    if action:
        query = query.where(AuditLog.action == action)

    offset = (page - 1) * size
    query = query.offset(offset).limit(size).order_by(AuditLog.created_at.desc())
    result = await db.execute(query)
    logs = result.scalars().all()

    return [
        {
            "id": log.id,
            "user_id": log.user_id,
            "action": log.action,
            "entity_type": log.entity_type,
            "entity_id": log.entity_id,
            "details": log.details,
            "ip_address": log.ip_address,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        }
        for log in logs
    ]


@router.post("/training/modules", response_model=TrainingModuleRead)
async def create_training_module(
    body: TrainingModuleCreate,
    current_user: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    module = TrainingModule(
        name=body.name,
        description=body.description,
        department=body.department,
        duration_hours=body.duration_hours,
        order_index=body.order_index,
        is_mandatory=body.is_mandatory,
    )
    db.add(module)
    await db.commit()
    await db.refresh(module)
    return TrainingModuleRead.model_validate(module)


@router.get("/training/modules", response_model=list[TrainingModuleRead])
async def list_training_modules(
    current_user: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(TrainingModule).order_by(TrainingModule.order_index))
    modules = result.scalars().all()
    return [TrainingModuleRead.model_validate(m) for m in modules]


@router.post("/tasks/{task_id}/override")
async def override_task(
    task_id: int,
    new_status: TaskStatus,
    current_user: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(OnboardingTask).where(OnboardingTask.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    old_status = task.status
    task.status = new_status
    task.result = {**(task.result or {}), "overridden_by": current_user.id, "old_status": old_status.value}
    await db.commit()

    audit = AuditLog(
        user_id=current_user.id,
        action="override_task",
        entity_type="onboarding_task",
        entity_id=task.id,
        details={"old_status": old_status.value, "new_status": new_status.value},
    )
    db.add(audit)
    await db.commit()

    return {"message": "Task overridden", "task_id": task_id, "new_status": new_status.value}


@router.get("/system/stats")
async def get_system_stats(
    current_user: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    total_candidates = await db.execute(select(func.count()).select_from(Candidate))
    total = total_candidates.scalar() or 0

    status_counts = {}
    for s in CandidateStatus:
        r = await db.execute(select(func.count()).select_from(Candidate).where(Candidate.status == s))
        status_counts[s.value] = r.scalar() or 0

    pending_approvals = await db.execute(
        select(func.count()).select_from(Approval).where(Approval.status == ApprovalStatus.pending)
    )
    total_pending = pending_approvals.scalar() or 0

    total_users = await db.execute(select(func.count()).select_from(User))
    users_count = total_users.scalar() or 0

    return {
        "total_candidates": total,
        "candidates_by_status": status_counts,
        "pending_approvals": total_pending,
        "total_users": users_count,
    }

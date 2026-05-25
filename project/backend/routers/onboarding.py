from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from middleware.rbac import require_roles
from models.user import User
from models.candidate import Candidate
from models.onboarding_task import OnboardingTask, TaskStatus

router = APIRouter(prefix="/onboarding", tags=["onboarding"])


@router.post("/start")
async def start_onboarding(
    body: dict,
    current_user: User = Depends(require_roles("hr", "admin")),
    db: AsyncSession = Depends(get_db),
):
    candidate_id = body.get("candidate_id")
    if not candidate_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="candidate_id is required")

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

import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from agents.orchestrator import OnboardingState
from models.candidate import Candidate, CandidateStatus
from models.onboarding_task import OnboardingTask, TaskStatus
from models.training import TrainingModule, TrainingProgress, TrainingStatus
from models.audit import AuditLog
from services.email_service import EmailService

logger = logging.getLogger(__name__)


class LDAgent:
    async def execute(self, state: OnboardingState, db: AsyncSession) -> OnboardingState:
        candidate_id = state["candidate_id"]
        candidate_data = state.get("candidate_data", {})
        department = candidate_data.get("department", "")

        # Update candidate status
        result = await db.execute(select(Candidate).where(Candidate.id == candidate_id))
        candidate = result.scalar_one_or_none()
        if not candidate:
            state["errors"] = state.get("errors", []) + ["Candidate not found"]
            return state

        candidate.status = CandidateStatus.training
        candidate.updated_at = datetime.now(timezone.utc)
        await db.flush()

        # Fetch mandatory training modules (all departments)
        result = await db.execute(
            select(TrainingModule).where(
                (TrainingModule.is_mandatory == True) &
                ((TrainingModule.department == None) | (TrainingModule.department == department))
            ).order_by(TrainingModule.order_index)
        )
        modules = result.scalars().all()

        if not modules:
            # If no modules exist, create default ones
            logger.info("No training modules found, candidate training marked as not applicable")
            state["training_assigned"] = True
            return state

        # Create TrainingProgress records
        assigned_modules = []
        for module in modules:
            # Check if already assigned
            existing = await db.execute(
                select(TrainingProgress).where(
                    (TrainingProgress.candidate_id == candidate_id) &
                    (TrainingProgress.module_id == module.id)
                )
            )
            if existing.scalar_one_or_none():
                assigned_modules.append(module.name)
                continue

            progress = TrainingProgress(
                candidate_id=candidate_id,
                module_id=module.id,
                status=TrainingStatus.not_started,
            )
            db.add(progress)
            assigned_modules.append(module.name)

        await db.flush()

        # Send training schedule email
        email_service = EmailService()
        if candidate.user:
            module_list = [f"- {name}" for name in assigned_modules]
            await email_service.send_onboarding_reminder(
                candidate_email=candidate.user.email,
                candidate_name=candidate.user.name,
                pending_items=[f"Complete training: {name}" for name in assigned_modules],
            )

        # Create task record
        task = OnboardingTask(
            candidate_id=candidate_id,
            agent_name="ld_agent",
            task_type="assign_training",
            status=TaskStatus.completed,
            payload={"department": department},
            result={"assigned_modules": assigned_modules},
        )
        db.add(task)

        audit = AuditLog(
            action="training_assigned",
            entity_type="candidate",
            entity_id=candidate_id,
            details={"assigned_modules": assigned_modules},
        )
        db.add(audit)
        await db.flush()

        state["training_assigned"] = True
        logger.info(f"Training assigned for candidate {candidate_id}: {len(assigned_modules)} modules")
        return state

import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.approval import Approval, ApprovalStatus
from models.onboarding_task import OnboardingTask, TaskStatus
from models.user import User, UserRole
from models.audit import AuditLog
from services.email_service import EmailService

logger = logging.getLogger(__name__)


class GovernanceAgent:
    async def create_approval(
        self,
        task_id: int,
        action_type: str,
        payload: dict,
        approver_role: str,
        db: AsyncSession,
    ) -> Approval:
        approval = Approval(
            task_id=task_id,
            action_type=action_type,
            payload=payload,
            status=ApprovalStatus.pending,
            approver_role=approver_role,
        )
        db.add(approval)
        await db.flush()

        # Send notification to all users with the approver role
        email_service = EmailService()
        role_enum = UserRole(approver_role)
        result = await db.execute(select(User).where(User.role == role_enum, User.is_active == True))
        approvers = result.scalars().all()

        for approver in approvers:
            await email_service.send_approval_request(
                approver_email=approver.email,
                action_type=action_type,
                approval_id=approval.id,
                payload=payload,
            )

        audit = AuditLog(
            action="approval_created",
            entity_type="approval",
            entity_id=approval.id,
            details={"action_type": action_type, "approver_role": approver_role},
        )
        db.add(audit)
        await db.flush()

        logger.info(f"Approval created (ID: {approval.id}) for action: {action_type}")
        return approval

    async def resolve_approval(
        self,
        approval_id: int,
        decision: str,
        notes: str,
        approver_id: int,
        db: AsyncSession,
    ) -> dict:
        result = await db.execute(select(Approval).where(Approval.id == approval_id))
        approval = result.scalar_one_or_none()
        if not approval:
            return {"error": "Approval not found"}

        approval.status = ApprovalStatus(decision)
        approval.approver_id = approver_id
        approval.notes = notes
        approval.resolved_at = datetime.now(timezone.utc)

        # Update task status
        if approval.task:
            if decision == "approved":
                approval.task.status = TaskStatus.completed
            else:
                approval.task.status = TaskStatus.failed

        audit = AuditLog(
            user_id=approver_id,
            action=f"approval_{decision}",
            entity_type="approval",
            entity_id=approval.id,
            details={"decision": decision, "notes": notes, "action_type": approval.action_type},
        )
        db.add(audit)
        await db.flush()

        logger.info(f"Approval {approval_id} resolved: {decision}")
        return {"approval_id": approval_id, "decision": decision, "workflow_resumed": decision == "approved"}

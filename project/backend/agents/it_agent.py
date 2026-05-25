import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from agents.orchestrator import OnboardingState
from models.candidate import Candidate, CandidateStatus
from models.onboarding_task import OnboardingTask, TaskStatus
from models.approval import Approval, ApprovalStatus
from models.user import User, UserRole
from models.audit import AuditLog
from services.provisioning_service import ProvisioningService
from services.email_service import EmailService
from agents.governance_agent import GovernanceAgent

logger = logging.getLogger(__name__)

DEPARTMENT_SOFTWARE = {
    "Engineering": ["GitHub", "Jira", "Slack", "VS Code License", "AWS Console"],
    "HR": ["Slack", "BambooHR", "Zoom", "Office 365"],
    "Finance": ["Slack", "QuickBooks", "Zoom", "Office 365", "Tableau"],
}
DEFAULT_SOFTWARE = ["Slack", "Zoom", "Office 365"]


class ITAgent:
    async def execute(self, state: OnboardingState, db: AsyncSession) -> OnboardingState:
        candidate_id = state["candidate_id"]

        result = await db.execute(select(Candidate).where(Candidate.id == candidate_id))
        candidate = result.scalar_one_or_none()
        if not candidate:
            state["errors"] = state.get("errors", []) + ["Candidate not found"]
            return state

        candidate.status = CandidateStatus.it_provisioning
        candidate.updated_at = datetime.now(timezone.utc)
        await db.flush()

        # Generate mock provisioning data
        prov_service = ProvisioningService()
        employee_id = await prov_service.generate_employee_id(candidate, db)
        work_email = await prov_service.create_work_email(candidate, db)
        laptop = await prov_service.assign_laptop(candidate, db)
        department = candidate.department
        software_list = DEPARTMENT_SOFTWARE.get(department, DEFAULT_SOFTWARE)
        # Don't actually provision yet - just prepare the data
        # Roll back the provisioning logs since we need HITL approval first
        from models.provisioning import ProvisioningLog
        result = await db.execute(
            select(ProvisioningLog).where(ProvisioningLog.candidate_id == candidate_id)
        )
        prov_logs = result.scalars().all()
        for log in prov_logs:
            await db.delete(log)
        await db.flush()

        access_card_preview = f"AC-{__import__('random').randint(10000000, 99999999)}"

        # Create task
        task = OnboardingTask(
            candidate_id=candidate_id,
            agent_name="it_agent",
            task_type="provision_it_resources",
            status=TaskStatus.waiting_approval,
            payload={
                "employee_id": employee_id,
                "work_email": work_email,
                "laptop": laptop,
                "software_list": software_list,
                "access_card": access_card_preview,
            },
        )
        db.add(task)
        await db.flush()

        # Create HITL approval
        gov_agent = GovernanceAgent()
        candidate_name = candidate.user.name if candidate.user else "Unknown"
        approval = await gov_agent.create_approval(
            task_id=task.id,
            action_type=f"Provision IT resources for {candidate_name}",
            payload={
                "candidate_id": candidate_id,
                "candidate_name": candidate_name,
                "employee_id": employee_id,
                "work_email": work_email,
                "laptop_asset_tag": laptop,
                "software_list": software_list,
                "access_card": access_card_preview,
                "department": department,
            },
            approver_role="it",
            db=db,
        )

        state["hitl_pending"] = True
        state["hitl_approval_id"] = approval.id
        state["it_provisioning"] = {
            "employee_id": employee_id,
            "work_email": work_email,
            "laptop": laptop,
            "software_list": software_list,
            "access_card": access_card_preview,
        }

        audit = AuditLog(
            action="it_provisioning_requested",
            entity_type="candidate",
            entity_id=candidate_id,
            details={"approval_id": approval.id, "employee_id": employee_id, "work_email": work_email},
        )
        db.add(audit)
        await db.flush()

        logger.info(f"IT provisioning HITL approval created (ID: {approval.id}) for candidate {candidate_id}")
        return state

    async def execute_after_approval(self, state: OnboardingState, db: AsyncSession) -> OnboardingState:
        """Execute actual provisioning after HITL approval."""
        candidate_id = state["candidate_id"]

        result = await db.execute(select(Candidate).where(Candidate.id == candidate_id))
        candidate = result.scalar_one_or_none()
        if not candidate:
            state["errors"] = state.get("errors", []) + ["Candidate not found"]
            return state

        prov_service = ProvisioningService()
        it_data = state.get("it_provisioning", {})

        # Actually provision
        employee_id = await prov_service.generate_employee_id(candidate, db)
        work_email = await prov_service.create_work_email(candidate, db)
        laptop = await prov_service.assign_laptop(candidate, db)
        software_list = it_data.get("software_list", DEFAULT_SOFTWARE)
        software_results = await prov_service.provision_software(candidate, software_list, db)
        access_card = await prov_service.create_access_card(candidate, db)

        # Update candidate record
        candidate.employee_id = employee_id
        candidate.work_email = work_email
        candidate.updated_at = datetime.now(timezone.utc)

        # Send welcome email
        email_service = EmailService()
        if candidate.user:
            await email_service.send_welcome_email(
                candidate_email=candidate.user.email,
                candidate_name=candidate.user.name,
                employee_id=employee_id,
                work_email=work_email,
            )

        state["it_provisioning"] = {
            "employee_id": employee_id,
            "work_email": work_email,
            "laptop": laptop,
            "software_list": software_results,
            "access_card": access_card,
            "provisioned": True,
        }

        audit = AuditLog(
            action="it_resources_provisioned",
            entity_type="candidate",
            entity_id=candidate_id,
            details={"employee_id": employee_id, "work_email": work_email},
        )
        db.add(audit)
        await db.flush()

        logger.info(f"IT resources provisioned for candidate {candidate_id}: {employee_id}, {work_email}")
        return state

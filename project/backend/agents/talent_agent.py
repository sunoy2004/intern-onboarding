import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from agents.orchestrator import OnboardingState
from models.candidate import Candidate
from models.onboarding_task import OnboardingTask, TaskStatus
from models.approval import Approval, ApprovalStatus
from models.user import User, UserRole
from models.audit import AuditLog
from services.llm_service import LLMService
from services.email_service import EmailService
from agents.governance_agent import GovernanceAgent

logger = logging.getLogger(__name__)


class TalentAgent:
    async def execute(self, state: OnboardingState, db: AsyncSession) -> OnboardingState:
        candidate_data = state.get("candidate_data", {})
        candidate_name = candidate_data.get("name", "Candidate")
        candidate_email = candidate_data.get("email", "")
        job_title = candidate_data.get("job_title", "Software Engineer")
        department = candidate_data.get("department", "Engineering")
        start_date = candidate_data.get("start_date", "TBD")

        # Generate offer letter using LLM
        llm = LLMService()
        prompt = (
            f"Generate a professional offer letter for {candidate_name} "
            f"for the position of {job_title} in the {department} department. "
            f"Start date: {start_date}. Include standard offer terms like "
            f"salary, benefits, and employment conditions. Format as clean text."
        )
        offer_letter = await llm.generate(prompt, system="You are an HR offer letter generator. Be professional and thorough.")

        # Create OnboardingTask record for offer letter generation
        task = OnboardingTask(
            candidate_id=state["candidate_id"],
            agent_name="talent_agent",
            task_type="generate_offer_letter",
            status=TaskStatus.completed,
            payload={"candidate_name": candidate_name, "job_title": job_title},
            result={"offer_letter": offer_letter[:500]},  # Store truncated
        )
        db.add(task)
        await db.flush()

        # Create Approval for sending offer email (HITL)
        gov_agent = GovernanceAgent()
        approval = await gov_agent.create_approval(
            task_id=task.id,
            action_type=f"Send offer letter email to {candidate_email}",
            payload={
                "to": candidate_email,
                "subject": f"Your Offer Letter - {job_title}",
                "body": offer_letter,
                "candidate_id": state["candidate_id"],
                "candidate_name": candidate_name,
                "job_title": job_title,
                "start_date": start_date,
                "department": department,
            },
            approver_role="hr",
            db=db,
        )

        state["hitl_pending"] = True
        state["hitl_approval_id"] = approval.id

        audit = AuditLog(
            action="offer_letter_generated",
            entity_type="candidate",
            entity_id=state["candidate_id"],
            details={"approval_id": approval.id, "task_id": task.id},
        )
        db.add(audit)
        await db.flush()

        logger.info(f"Offer letter generated and HITL approval created (ID: {approval.id}) for candidate {state['candidate_id']}")
        return state

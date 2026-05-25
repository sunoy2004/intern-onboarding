import json
import logging
from datetime import datetime, timezone
from typing import TypedDict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.candidate import Candidate, CandidateStatus
from models.onboarding_task import OnboardingTask, TaskStatus
from models.workflow import WorkflowState
from models.audit import AuditLog

logger = logging.getLogger(__name__)


class OnboardingState(TypedDict, total=False):
    candidate_id: int
    task_id: int
    current_step: str
    candidate_data: dict
    documents_status: dict
    hitl_pending: bool
    hitl_approval_id: int | None
    hitl_decision: str | None
    it_provisioning: dict
    training_assigned: bool
    errors: list[str]
    completed: bool


async def load_candidate(state: OnboardingState, db: AsyncSession) -> OnboardingState:
    logger.info(f"Loading candidate data for ID: {state.get('candidate_id')}")
    result = await db.execute(
        select(Candidate).where(Candidate.id == state["candidate_id"])
    )
    candidate = result.scalar_one_or_none()
    if not candidate:
        state["errors"] = state.get("errors", []) + [f"Candidate {state['candidate_id']} not found"]
        return state

    candidate_data = {
        "id": candidate.id,
        "name": candidate.user.name if candidate.user else "Unknown",
        "email": candidate.user.email if candidate.user else "",
        "department": candidate.department,
        "job_title": candidate.job_title,
        "start_date": str(candidate.start_date) if candidate.start_date else None,
        "status": candidate.status.value,
    }

    state["candidate_data"] = candidate_data
    state["current_step"] = "load_candidate"
    state["documents_status"] = {}
    state["hitl_pending"] = False
    state["hitl_approval_id"] = None
    state["hitl_decision"] = None
    state["it_provisioning"] = {}
    state["training_assigned"] = False
    state["errors"] = state.get("errors", [])
    state["completed"] = False

    logger.info(f"Candidate loaded: {candidate_data['name']} ({candidate_data['email']})")
    return state


async def talent_agent_node(state: OnboardingState, db: AsyncSession) -> OnboardingState:
    logger.info(f"Talent agent node for candidate {state['candidate_id']}")
    state["current_step"] = "talent_agent"

    try:
        from agents.talent_agent import TalentAgent
        agent = TalentAgent()
        state = await agent.execute(state, db)
    except Exception as e:
        logger.error(f"Talent agent error: {e}")
        state["errors"] = state.get("errors", []) + [f"Talent agent error: {str(e)}"]
        audit = AuditLog(
            action="talent_agent_error",
            entity_type="candidate",
            entity_id=state["candidate_id"],
            details={"error": str(e)},
        )
        db.add(audit)
        await db.flush()

    return state


async def hr_agent_node(state: OnboardingState, db: AsyncSession) -> OnboardingState:
    logger.info(f"HR agent node for candidate {state['candidate_id']}")
    state["current_step"] = "hr_agent"

    try:
        from agents.hr_agent import HRAgent
        agent = HRAgent()
        state = await agent.execute(state, db)
    except Exception as e:
        logger.error(f"HR agent error: {e}")
        state["errors"] = state.get("errors", []) + [f"HR agent error: {str(e)}"]
        audit = AuditLog(
            action="hr_agent_error",
            entity_type="candidate",
            entity_id=state["candidate_id"],
            details={"error": str(e)},
        )
        db.add(audit)
        await db.flush()

    return state


async def it_agent_node(state: OnboardingState, db: AsyncSession) -> OnboardingState:
    logger.info(f"IT agent node for candidate {state['candidate_id']}")
    state["current_step"] = "it_agent"

    try:
        from agents.it_agent import ITAgent
        agent = ITAgent()
        state = await agent.execute(state, db)
    except Exception as e:
        logger.error(f"IT agent error: {e}")
        state["errors"] = state.get("errors", []) + [f"IT agent error: {str(e)}"]
        audit = AuditLog(
            action="it_agent_error",
            entity_type="candidate",
            entity_id=state["candidate_id"],
            details={"error": str(e)},
        )
        db.add(audit)
        await db.flush()

    return state


async def ld_agent_node(state: OnboardingState, db: AsyncSession) -> OnboardingState:
    logger.info(f"L&D agent node for candidate {state['candidate_id']}")
    state["current_step"] = "ld_agent"

    try:
        from agents.ld_agent import LDAgent
        agent = LDAgent()
        state = await agent.execute(state, db)
    except Exception as e:
        logger.error(f"L&D agent error: {e}")
        state["errors"] = state.get("errors", []) + [f"L&D agent error: {str(e)}"]
        audit = AuditLog(
            action="ld_agent_error",
            entity_type="candidate",
            entity_id=state["candidate_id"],
            details={"error": str(e)},
        )
        db.add(audit)
        await db.flush()

    return state


async def complete_onboarding(state: OnboardingState, db: AsyncSession) -> OnboardingState:
    logger.info(f"Completing onboarding for candidate {state['candidate_id']}")
    state["current_step"] = "complete"

    result = await db.execute(
        select(Candidate).where(Candidate.id == state["candidate_id"])
    )
    candidate = result.scalar_one_or_none()
    if candidate:
        candidate.status = CandidateStatus.onboarded
        candidate.updated_at = datetime.now(timezone.utc)

    result = await db.execute(
        select(OnboardingTask).where(OnboardingTask.id == state.get("task_id"))
    )
    task = result.scalar_one_or_none()
    if task:
        task.status = TaskStatus.completed
        task.result = {"completed_at": datetime.now(timezone.utc).isoformat()}

    # Deactivate workflow state
    result = await db.execute(
        select(WorkflowState).where(
            WorkflowState.candidate_id == state["candidate_id"],
            WorkflowState.is_active == True,
        )
    )
    ws = result.scalar_one_or_none()
    if ws:
        ws.is_active = False

    audit = AuditLog(
        action="onboarding_completed",
        entity_type="candidate",
        entity_id=state["candidate_id"],
        details={"completed_at": datetime.now(timezone.utc).isoformat()},
    )
    db.add(audit)
    await db.commit()

    state["completed"] = True
    logger.info(f"Onboarding completed for candidate {state['candidate_id']}")
    return state


def should_continue_after_hitl(state: OnboardingState) -> str:
    decision = state.get("hitl_decision")
    if decision == "approved":
        return "continue"
    elif decision == "rejected":
        return "reject"
    return "wait"


def should_continue_after_hr(state: OnboardingState) -> str:
    docs_status = state.get("documents_status", {})
    all_verified = all(s == "verified" for s in docs_status.values())
    if all_verified and docs_status:
        return "it_agent"
    return "wait"


def should_wait_for_hitl(state: OnboardingState) -> str:
    if state.get("hitl_pending"):
        return "hitl_wait"
    return "continue"


async def save_checkpoint(state: OnboardingState, db: AsyncSession) -> OnboardingState:
    checkpoint_key = f"onboarding_{state['candidate_id']}_{state.get('task_id', 0)}"
    state_json = json.dumps({k: v for k, v in state.items() if k != "errors" or v})

    result = await db.execute(
        select(WorkflowState).where(WorkflowState.checkpoint_key == checkpoint_key)
    )
    ws = result.scalar_one_or_none()

    if ws:
        ws.graph_state_json = state_json
        ws.is_active = True
    else:
        ws = WorkflowState(
            candidate_id=state["candidate_id"],
            checkpoint_key=checkpoint_key,
            graph_state_json=state_json,
            is_active=True,
        )
        db.add(ws)

    await db.flush()
    return state


async def run_onboarding_workflow(candidate_id: int, task_id: int, db: AsyncSession) -> OnboardingState:
    """Main entry point - runs the full onboarding workflow."""
    state: OnboardingState = {
        "candidate_id": candidate_id,
        "task_id": task_id,
        "current_step": "init",
        "candidate_data": {},
        "documents_status": {},
        "hitl_pending": False,
        "hitl_approval_id": None,
        "hitl_decision": None,
        "it_provisioning": {},
        "training_assigned": False,
        "errors": [],
        "completed": False,
    }

    # Step 1: Load candidate
    state = await load_candidate(state, db)

    # Step 2: Talent agent (generate offer, request approval)
    state = await talent_agent_node(state, db)
    state = await save_checkpoint(state, db)
    await db.commit()

    if state.get("hitl_pending"):
        logger.info("Workflow paused for HITL approval on offer letter")
        return state

    # Step 3: HR agent (document verification)
    state = await hr_agent_node(state, db)
    state = await save_checkpoint(state, db)
    await db.commit()

    docs_status = state.get("documents_status", {})
    all_verified = all(s == "verified" for s in docs_status.values()) if docs_status else False

    if not all_verified:
        logger.info("Workflow paused - documents not yet verified")
        return state

    # Step 4: IT agent (provisioning)
    state = await it_agent_node(state, db)
    state = await save_checkpoint(state, db)
    await db.commit()

    if state.get("hitl_pending"):
        logger.info("Workflow paused for HITL approval on IT provisioning")
        return state

    # Step 5: L&D agent (training)
    state = await ld_agent_node(state, db)
    state = await save_checkpoint(state, db)
    await db.commit()

    # Step 6: Complete
    if not state.get("errors"):
        state = await complete_onboarding(state, db)

    return state


async def resume_workflow(candidate_id: int, decision: str, db: AsyncSession) -> OnboardingState | None:
    """Resume a paused workflow after HITL approval."""
    result = await db.execute(
        select(WorkflowState).where(
            WorkflowState.candidate_id == candidate_id,
            WorkflowState.is_active == True,
        )
    )
    ws = result.scalar_one_or_none()
    if not ws:
        logger.warning(f"No active workflow state found for candidate {candidate_id}")
        return None

    state: OnboardingState = json.loads(ws.graph_state_json)
    state["hitl_decision"] = decision
    state["hitl_pending"] = False

    if decision == "rejected":
        result = await db.execute(
            select(Candidate).where(Candidate.id == candidate_id)
        )
        candidate = result.scalar_one_or_none()
        if candidate:
            candidate.status = CandidateStatus.rejected
            candidate.updated_at = datetime.now(timezone.utc)

        result = await db.execute(
            select(OnboardingTask).where(OnboardingTask.id == state.get("task_id"))
        )
        task = result.scalar_one_or_none()
        if task:
            task.status = TaskStatus.failed
            task.result = {"rejected_at": datetime.now(timezone.utc).isoformat()}

        ws.is_active = False
        await db.commit()
        return state

    current_step = state.get("current_step", "")

    if current_step == "talent_agent":
        # After offer approval, continue to HR agent
        state = await hr_agent_node(state, db)
        state = await save_checkpoint(state, db)
        await db.commit()

        docs_status = state.get("documents_status", {})
        all_verified = all(s == "verified" for s in docs_status.values()) if docs_status else False

        if all_verified:
            state = await it_agent_node(state, db)
            state = await save_checkpoint(state, db)
            await db.commit()

            if not state.get("hitl_pending"):
                state = await ld_agent_node(state, db)
                state = await save_checkpoint(state, db)
                await db.commit()
                if not state.get("errors"):
                    state = await complete_onboarding(state, db)

    elif current_step == "it_agent":
        # After IT approval, execute provisioning then L&D
        try:
            from agents.it_agent import ITAgent
            agent = ITAgent()
            state = await agent.execute_after_approval(state, db)
        except Exception as e:
            logger.error(f"IT provisioning after approval error: {e}")
            state["errors"] = state.get("errors", []) + [str(e)]

        state = await ld_agent_node(state, db)
        state = await save_checkpoint(state, db)
        await db.commit()

        if not state.get("errors"):
            state = await complete_onboarding(state, db)

    return state

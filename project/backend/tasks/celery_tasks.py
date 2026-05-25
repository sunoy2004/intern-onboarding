import logging
from datetime import datetime, timezone, timedelta

from celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task
def process_document_ocr(document_id: int):
    """Run OCR on document and update status based on confidence."""
    import asyncio
    from database import async_session
    from sqlalchemy import select
    from models.document import Document, DocStatus
    from models.audit import AuditLog
    from services.ocr_service import OCRService

    async def _run():
        async with async_session() as db:
            result = await db.execute(select(Document).where(Document.id == document_id))
            doc = result.scalar_one_or_none()
            if not doc:
                logger.error(f"Document {document_id} not found")
                return

            doc.status = DocStatus.processing
            await db.commit()

            ocr_service = OCRService()
            ocr_result = await ocr_service.extract_text(doc.file_path)

            doc.ocr_text = ocr_result["text"]
            doc.ocr_confidence = ocr_result["confidence"]

            confidence = ocr_result["confidence"]
            if confidence > 85:
                doc.status = DocStatus.verified
                doc.verified_at = datetime.now(timezone.utc)
            elif confidence >= 50:
                doc.status = DocStatus.uploaded  # needs human review
            else:
                doc.status = DocStatus.needs_resubmission
                doc.rejection_reason = f"OCR confidence too low ({confidence}%)"

            audit = AuditLog(
                action="document_ocr_processed",
                entity_type="document",
                entity_id=document_id,
                details={"confidence": confidence, "status": doc.status.value},
            )
            db.add(audit)
            await db.commit()

    asyncio.run(_run())


@celery_app.task
def send_training_reminders():
    """Send reminder emails for overdue training modules."""
    import asyncio
    from database import async_session
    from sqlalchemy import select, and_
    from models.candidate import Candidate, CandidateStatus
    from models.training import TrainingProgress, TrainingStatus
    from models.user import User
    from services.email_service import EmailService

    async def _run():
        async with async_session() as db:
            result = await db.execute(
                select(Candidate).where(Candidate.status == CandidateStatus.training)
            )
            candidates = result.scalars().all()
            email_service = EmailService()

            for candidate in candidates:
                result = await db.execute(
                    select(TrainingProgress).where(
                        and_(
                            TrainingProgress.candidate_id == candidate.id,
                            TrainingProgress.status != TrainingStatus.completed,
                            TrainingProgress.started_at != None,
                            TrainingProgress.started_at < datetime.now(timezone.utc) - timedelta(days=7),
                        )
                    )
                )
                overdue = result.scalars().all()

                if overdue and candidate.user:
                    overdue_names = [p.module.name for p in overdue if p.module]
                    await email_service.send_training_reminder(
                        candidate_email=candidate.user.email,
                        candidate_name=candidate.user.name,
                        overdue_modules=overdue_names,
                    )

    asyncio.run(_run())


@celery_app.task
def check_stalled_onboardings():
    """Find tasks stuck in 'in_progress' for too long."""
    import asyncio
    from database import async_session
    from sqlalchemy import select, and_
    from models.onboarding_task import OnboardingTask, TaskStatus
    from models.audit import AuditLog

    async def _run():
        async with async_session() as db:
            cutoff = datetime.now(timezone.utc) - timedelta(hours=2)
            result = await db.execute(
                select(OnboardingTask).where(
                    and_(
                        OnboardingTask.status == TaskStatus.in_progress,
                        OnboardingTask.updated_at < cutoff,
                    )
                )
            )
            stalled = result.scalars().all()

            for task in stalled:
                audit = AuditLog(
                    action="stalled_onboarding_warning",
                    entity_type="onboarding_task",
                    entity_id=task.id,
                    details={"candidate_id": task.candidate_id, "task_type": task.task_type},
                )
                db.add(audit)
                logger.warning(f"Stalled task: {task.id} for candidate {task.candidate_id}")

            await db.commit()

    asyncio.run(_run())


@celery_app.task
def run_onboarding_workflow(candidate_id: int, task_id: int):
    """Main task: runs the LangGraph orchestrator for a candidate."""
    import asyncio
    from database import async_session
    from agents.orchestrator import run_onboarding_workflow as _run_workflow

    async def _run():
        async with async_session() as db:
            await _run_workflow(candidate_id, task_id, db)

    asyncio.run(_run())

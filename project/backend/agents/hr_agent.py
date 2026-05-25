import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from agents.orchestrator import OnboardingState
from models.candidate import Candidate, CandidateStatus
from models.document import Document, DocType, DocStatus
from models.onboarding_task import OnboardingTask, TaskStatus
from models.approval import Approval, ApprovalStatus
from models.audit import AuditLog
from services.ocr_service import OCRService
from services.email_service import EmailService
from agents.governance_agent import GovernanceAgent

logger = logging.getLogger(__name__)

REQUIRED_DOC_TYPES = ["id_proof", "address_proof", "education_certificate", "pan_card"]


class HRAgent:
    async def execute(self, state: OnboardingState, db: AsyncSession) -> OnboardingState:
        candidate_id = state["candidate_id"]

        # Update candidate status
        result = await db.execute(select(Candidate).where(Candidate.id == candidate_id))
        candidate = result.scalar_one_or_none()
        if not candidate:
            state["errors"] = state.get("errors", []) + ["Candidate not found"]
            return state

        if candidate.status == CandidateStatus.applied:
            candidate.status = CandidateStatus.documents_pending
            candidate.updated_at = datetime.now(timezone.utc)

        # Load all documents for this candidate
        result = await db.execute(select(Document).where(Document.candidate_id == candidate_id))
        docs = result.scalars().all()

        documents_status = {}
        missing_docs = []

        # Check which doc types are present
        existing_types = {d.doc_type.value for d in docs}

        for req_type in REQUIRED_DOC_TYPES:
            if req_type not in existing_types:
                missing_docs.append(req_type)
                documents_status[req_type] = "missing"

        # Process each uploaded document
        ocr_service = OCRService()
        for doc in docs:
            doc_type_key = doc.doc_type.value
            documents_status[doc_type_key] = doc.status.value

            if doc.status == DocStatus.uploaded and doc.ocr_confidence is None:
                # Run OCR
                try:
                    doc.status = DocStatus.processing
                    await db.flush()

                    ocr_result = await ocr_service.extract_text(doc.file_path)
                    doc.ocr_text = ocr_result["text"]
                    doc.ocr_confidence = ocr_result["confidence"]

                    # Validate document
                    validation = await ocr_service.validate_document(doc_type_key, ocr_result)

                    if ocr_result["confidence"] > 85 and validation["is_valid"]:
                        doc.status = DocStatus.verified
                        doc.verified_at = datetime.now(timezone.utc)
                        documents_status[doc_type_key] = "verified"
                    elif ocr_result["confidence"] >= 50:
                        # Needs human review - create HITL approval
                        gov_agent = GovernanceAgent()
                        task = OnboardingTask(
                            candidate_id=candidate_id,
                            agent_name="hr_agent",
                            task_type="verify_document",
                            status=TaskStatus.waiting_approval,
                            payload={"document_id": doc.id, "doc_type": doc_type_key, "confidence": ocr_result["confidence"]},
                        )
                        db.add(task)
                        await db.flush()

                        approval = await gov_agent.create_approval(
                            task_id=task.id,
                            action_type=f"Review document: {doc_type_key} for candidate {candidate.user.name if candidate.user else 'Unknown'} (confidence: {ocr_result['confidence']}%)",
                            payload={"document_id": doc.id, "doc_type": doc_type_key, "confidence": ocr_result["confidence"], "issues": validation.get("issues", [])},
                            approver_role="hr",
                            db=db,
                        )
                        state["hitl_pending"] = True
                        state["hitl_approval_id"] = approval.id
                        documents_status[doc_type_key] = "needs_review"
                    else:
                        doc.status = DocStatus.needs_resubmission
                        doc.rejection_reason = f"OCR confidence too low ({ocr_result['confidence']}%)"
                        documents_status[doc_type_key] = "needs_resubmission"

                    await db.flush()

                except Exception as e:
                    logger.error(f"OCR processing failed for doc {doc.id}: {e}")
                    doc.status = DocStatus.uploaded
                    documents_status[doc_type_key] = "uploaded"

            elif doc.status == DocStatus.verified:
                documents_status[doc_type_key] = "verified"

        state["documents_status"] = documents_status

        # Check if all required docs are verified
        all_verified = all(
            documents_status.get(dt) == "verified"
            for dt in REQUIRED_DOC_TYPES
        )

        if missing_docs:
            # Send email requesting missing docs
            email_service = EmailService()
            if candidate.user:
                await email_service.send_onboarding_reminder(
                    candidate_email=candidate.user.email,
                    candidate_name=candidate.user.name,
                    pending_items=[f"Please upload your {dt.replace('_', ' ')}" for dt in missing_docs],
                )
            candidate.status = CandidateStatus.documents_pending
            candidate.updated_at = datetime.now(timezone.utc)

            audit = AuditLog(
                action="missing_documents_notified",
                entity_type="candidate",
                entity_id=candidate_id,
                details={"missing_docs": missing_docs},
            )
            db.add(audit)

        elif all_verified:
            candidate.status = CandidateStatus.documents_verified
            candidate.updated_at = datetime.now(timezone.utc)
            logger.info(f"All documents verified for candidate {candidate_id}")

        await db.flush()
        return state

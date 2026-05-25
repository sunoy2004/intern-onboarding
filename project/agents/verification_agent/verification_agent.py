import os
import logging
from datetime import datetime
import httpx
import asyncpg
from event_contracts.broker import RedisEventBus

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:password@localhost:5432/onboarding_db")
if "postgresql+asyncpg://" in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")

OCR_SERVICE_URL = os.getenv("OCR_SERVICE_URL", "http://localhost:8001")
VERIFICATION_SERVICE_URL = os.getenv("VERIFICATION_SERVICE_URL", "http://localhost:8002")

class VerificationAgent:
    def __init__(self):
        self.event_bus = RedisEventBus()

    async def process_document_upload(self, candidate_id: int, doc_type: str, file_name: str, file_base64: str) -> dict:
        logger.info(f"VerificationAgent processing document: {doc_type} for candidate {candidate_id}")
        allowed_doc_types = {"aadhaar_card", "pan_card", "bank_passbook"}
        if doc_type not in allowed_doc_types:
            raise ValueError("Only Aadhaar card, PAN card, and bank passbook are supported")
        
        # 1. Forward to OCR service (in-memory, clean extraction)
        async with httpx.AsyncClient() as client:
            payload = {
                "doc_type": doc_type,
                "file_name": file_name,
                "file_base64": file_base64
            }
            ocr_response = await client.post(f"{OCR_SERVICE_URL}/ocr/extract", json=payload, timeout=30.0)
            
            if ocr_response.status_code != 200:
                raise Exception(f"OCR Service failed: {ocr_response.text}")
                
            ocr_result = ocr_response.json()
            ocr_text = ocr_result["text"]
            ocr_confidence = ocr_result["confidence"]
            ocr_engine = ocr_result.get("engine", "unknown")
            ocr_model = ocr_result.get("model", "unknown")
            logger.info(
                "OCR completed for candidate %s doc=%s engine=%s model=%s confidence=%s",
                candidate_id,
                doc_type,
                ocr_engine,
                ocr_model,
                ocr_confidence,
            )

        # 2. Call Verification Service to run compliance checks and fraud rules
        async with httpx.AsyncClient() as client:
            verification_payload = {
                "candidate_id": candidate_id,
                "doc_type": doc_type,
                "ocr_text": ocr_text,
                "ocr_confidence": ocr_confidence,
                "ocr_engine": ocr_engine,
                "ocr_model": ocr_model,
                "ocr_filename": file_name,
            }
            verify_response = await client.post(
                f"{VERIFICATION_SERVICE_URL}/verification/verify-document",
                json=verification_payload,
                timeout=30.0
            )
            
            if verify_response.status_code != 200:
                raise Exception(f"Verification Service failed: {verify_response.text}")
                
            verify_result = verify_response.json()

        conn = await asyncpg.connect(DATABASE_URL)
        try:
            await conn.execute(
                "UPDATE candidates SET status = CASE WHEN status = 'applied' THEN 'documents_pending' ELSE status END, updated_at = now() WHERE id = $1",
                candidate_id,
            )
        finally:
            await conn.close()

        # 3. Check if all required documents are now uploaded and verified
        await self.check_and_progress_workflow(candidate_id)

        return verify_result

    async def verify_bank_details(self, candidate_id: int, account_number: str, ifsc: str, full_name: str) -> dict:
        logger.info(f"VerificationAgent verifying bank details for candidate {candidate_id}")
        async with httpx.AsyncClient() as client:
            payload = {
                "candidate_id": candidate_id,
                "bank_account_number": account_number,
                "ifsc_code": ifsc,
                "full_name": full_name
            }
            response = await client.post(
                f"{VERIFICATION_SERVICE_URL}/verification/verify-bank",
                json=payload,
                timeout=15.0
            )
            if response.status_code != 200:
                raise Exception(f"Bank verification failed: {response.text}")
            
            verify_result = response.json()
            
        await self.check_and_progress_workflow(candidate_id)
        return verify_result

    async def sign_offer_letter(self, candidate_id: int, signature_data: str, ip_address: str) -> dict:
        logger.info(f"VerificationAgent executing offer letter signature for candidate {candidate_id}")
        async with httpx.AsyncClient() as client:
            payload = {
                "candidate_id": candidate_id,
                "signature_data": signature_data,
                "ip_address": ip_address,
                "timestamp": datetime.now().isoformat() if 'datetime' in globals() else "2026-05-25T13:11:56+05:30"
            }
            response = await client.post(
                f"{VERIFICATION_SERVICE_URL}/verification/sign-offer-letter",
                json=payload,
                timeout=15.0
            )
            if response.status_code != 200:
                raise Exception(f"E-Sign signature processing failed: {response.text}")
            
            sign_result = response.json()

        await self.check_and_progress_workflow(candidate_id)
        return sign_result

    async def check_and_progress_workflow(self, candidate_id: int):
        conn = await asyncpg.connect(DATABASE_URL)
        
        # Required columns check in extracted_document_data
        data = await conn.fetchrow(
            "SELECT * FROM extracted_document_data WHERE candidate_id = $1",
            candidate_id
        )
        
        if not data:
            await conn.close()
            return

        required_docs = {"aadhaar_card", "pan_card", "bank_passbook"}
        records = await conn.fetch(
            "SELECT DISTINCT ON (document_type) document_type, status FROM verification_records "
            "WHERE candidate_id = $1 ORDER BY document_type, created_at DESC",
            candidate_id,
        )
        verified_docs = {row["document_type"] for row in records if row["status"] == "verified"}

        # Verification rules: PAN, Aadhaar, and bank details must be extracted from documents.
        is_pan_valid = bool(data["pan_number"])
        is_aadhaar_valid = bool(data["aadhaar_number"])
        is_bank_valid = bool(data["bank_account_number"] and data["ifsc_code"])
        is_offer_signed = bool(data["signed_offer_letter"])
        are_required_docs_verified = required_docs.issubset(verified_docs)

        logger.info(f"Verification Check candidate {candidate_id}: PAN={is_pan_valid}, Aadhaar={is_aadhaar_valid}, Bank={is_bank_valid}, OfferSigned={is_offer_signed}, Docs={verified_docs}")

        if is_pan_valid and is_aadhaar_valid and is_bank_valid and are_required_docs_verified:
            await conn.execute(
                "UPDATE candidates SET status = 'documents_verified', updated_at = now() WHERE id = $1",
                candidate_id
            )

        if is_pan_valid and is_aadhaar_valid and is_bank_valid and is_offer_signed and are_required_docs_verified:
            
            # Retrieve session
            session = await conn.fetchrow(
                "SELECT * FROM onboarding_sessions WHERE candidate_id = $1 AND status = 'in_progress'",
                candidate_id
            )
            session_id = session["id"] if session else None
            
            # Fire verification complete event
            await self.event_bus.publish_event("VerificationCompletedEvent", {
                "candidate_id": candidate_id,
                "session_id": session_id,
                "pan_number": data["pan_number"],
                "aadhaar_number": data["aadhaar_number"],
                "bank_account_number": data["bank_account_number"],
                "ifsc_code": data["ifsc_code"],
                "full_name": data["full_name"]
            })
            logger.info(f"VerificationCompletedEvent published for candidate {candidate_id}")

        await conn.close()

from datetime import datetime

from pydantic import BaseModel

from models.document import DocType, DocStatus


class DocumentRead(BaseModel):
    id: int
    candidate_id: int
    doc_type: DocType
    file_path: str
    original_filename: str
    ocr_confidence: float | None
    ocr_text: str | None
    status: DocStatus
    rejection_reason: str | None
    uploaded_at: datetime
    verified_at: datetime | None

    model_config = {"from_attributes": True}


class DocumentValidation(BaseModel):
    is_valid: bool
    confidence: float
    issues: list[str]

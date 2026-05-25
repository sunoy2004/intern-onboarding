import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base
from models.candidate import Candidate


class DocType(str, enum.Enum):
    id_proof = "id_proof"
    address_proof = "address_proof"
    education_certificate = "education_certificate"
    experience_letter = "experience_letter"
    pan_card = "pan_card"
    offer_letter_signed = "offer_letter_signed"


class DocStatus(str, enum.Enum):
    uploaded = "uploaded"
    processing = "processing"
    verified = "verified"
    rejected = "rejected"
    needs_resubmission = "needs_resubmission"


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    candidate_id: Mapped[int] = mapped_column(Integer, ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False)
    doc_type: Mapped[DocType] = mapped_column(Enum(DocType), nullable=False)
    file_path: Mapped[str] = mapped_column(String, nullable=False)
    original_filename: Mapped[str] = mapped_column(String, nullable=False, default="")
    ocr_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    ocr_text: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[DocStatus] = mapped_column(Enum(DocStatus), nullable=False, default=DocStatus.uploaded)
    rejection_reason: Mapped[str | None] = mapped_column(String, nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    candidate: Mapped[Candidate] = relationship("Candidate", lazy="selectin")

import enum
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base
from models.user import User


class CandidateStatus(str, enum.Enum):
    applied = "applied"
    documents_pending = "documents_pending"
    documents_submitted = "documents_submitted"
    documents_verified = "documents_verified"
    it_provisioning = "it_provisioning"
    training = "training"
    onboarded = "onboarded"
    rejected = "rejected"


class Candidate(Base):
    __tablename__ = "candidates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    status: Mapped[CandidateStatus] = mapped_column(Enum(CandidateStatus), nullable=False, default=CandidateStatus.applied)
    department: Mapped[str] = mapped_column(String, nullable=False, default="")
    job_title: Mapped[str] = mapped_column(String, nullable=False, default="")
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    employee_id: Mapped[str | None] = mapped_column(String, nullable=True)
    work_email: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    user: Mapped[User] = relationship("User", lazy="selectin")

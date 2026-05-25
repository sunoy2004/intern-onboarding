import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base
from models.task import OnboardingTask
from models.user import User


class ApprovalStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class Approval(Base):
    __tablename__ = "approvals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_id: Mapped[int] = mapped_column(Integer, ForeignKey("onboarding_tasks.id", ondelete="CASCADE"), nullable=False)
    action_type: Mapped[str] = mapped_column(String, nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    status: Mapped[ApprovalStatus] = mapped_column(Enum(ApprovalStatus), nullable=False, default=ApprovalStatus.pending)
    approver_role: Mapped[str] = mapped_column(String, nullable=False)
    approver_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    notes: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    task: Mapped[OnboardingTask] = relationship("OnboardingTask", lazy="selectin")
    approver: Mapped[User | None] = relationship("User", lazy="selectin")

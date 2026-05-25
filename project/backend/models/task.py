import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base
from models.candidate import Candidate


class TaskStatus(str, enum.Enum):
    pending = "pending"
    in_progress = "in_progress"
    waiting_approval = "waiting_approval"
    completed = "completed"
    failed = "failed"


class OnboardingTask(Base):
    __tablename__ = "onboarding_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    candidate_id: Mapped[int] = mapped_column(Integer, ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False)
    agent_name: Mapped[str] = mapped_column(String, nullable=False)
    task_type: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[TaskStatus] = mapped_column(Enum(TaskStatus), nullable=False, default=TaskStatus.pending)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    result: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    checkpoint_key: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    candidate: Mapped[Candidate] = relationship("Candidate", lazy="selectin")

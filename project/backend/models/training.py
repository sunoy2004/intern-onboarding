import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base
from models.candidate import Candidate


class TrainingStatus(str, enum.Enum):
    not_started = "not_started"
    in_progress = "in_progress"
    completed = "completed"


class TrainingModule(Base):
    __tablename__ = "training_modules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(String, nullable=False, default="")
    department: Mapped[str | None] = mapped_column(String, nullable=True)
    duration_hours: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_mandatory: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class TrainingProgress(Base):
    __tablename__ = "training_progress"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    candidate_id: Mapped[int] = mapped_column(Integer, ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False)
    module_id: Mapped[int] = mapped_column(Integer, ForeignKey("training_modules.id", ondelete="CASCADE"), nullable=False)
    status: Mapped[TrainingStatus] = mapped_column(Enum(TrainingStatus), nullable=False, default=TrainingStatus.not_started)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    candidate: Mapped[Candidate] = relationship("Candidate", lazy="selectin")
    module: Mapped[TrainingModule] = relationship("TrainingModule", lazy="selectin")

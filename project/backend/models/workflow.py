from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base
from models.candidate import Candidate


class WorkflowState(Base):
    __tablename__ = "workflow_states"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    candidate_id: Mapped[int] = mapped_column(Integer, ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False)
    checkpoint_key: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    graph_state_json: Mapped[str] = mapped_column(String, nullable=False, default="{}")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    candidate: Mapped[Candidate] = relationship("Candidate", lazy="selectin")

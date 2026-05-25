import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base
from models.candidate import Candidate


class ResourceType(str, enum.Enum):
    employee_id = "employee_id"
    work_email = "work_email"
    laptop = "laptop"
    software_access = "software_access"
    access_card = "access_card"


class ProvisioningLog(Base):
    __tablename__ = "provisioning_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    candidate_id: Mapped[int] = mapped_column(Integer, ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False)
    resource_type: Mapped[ResourceType] = mapped_column(Enum(ResourceType), nullable=False)
    resource_value: Mapped[str] = mapped_column(String, nullable=False, default="")
    provisioned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    provisioned_by_agent: Mapped[str] = mapped_column(String, nullable=False, default="it_agent")

    candidate: Mapped[Candidate] = relationship("Candidate", lazy="selectin")

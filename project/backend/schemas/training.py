from datetime import datetime

from pydantic import BaseModel

from models.training import TrainingStatus


class TrainingModuleRead(BaseModel):
    id: int
    name: str
    description: str
    department: str | None
    duration_hours: float
    order_index: int
    is_mandatory: bool

    model_config = {"from_attributes": True}


class TrainingModuleCreate(BaseModel):
    name: str
    description: str = ""
    department: str | None = None
    duration_hours: float = 1.0
    order_index: int = 0
    is_mandatory: bool = True


class TrainingProgressRead(BaseModel):
    id: int
    candidate_id: int
    module_id: int
    status: TrainingStatus
    started_at: datetime | None
    completed_at: datetime | None
    module: TrainingModuleRead | None = None

    model_config = {"from_attributes": True}

from datetime import date, datetime

from pydantic import BaseModel

from models.candidate import CandidateStatus
from schemas.user import UserRead


class CandidateCreate(BaseModel):
    user_id: int
    department: str = ""
    job_title: str = ""
    start_date: date | None = None


class CandidateRead(BaseModel):
    id: int
    user_id: int
    status: CandidateStatus
    department: str
    job_title: str
    start_date: date | None
    employee_id: str | None
    work_email: str | None
    created_at: datetime
    updated_at: datetime
    user: UserRead | None = None

    model_config = {"from_attributes": True}


class CandidateStatusUpdate(BaseModel):
    status: CandidateStatus

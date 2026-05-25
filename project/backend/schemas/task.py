from datetime import datetime

from pydantic import BaseModel

from models.task import TaskStatus


class TaskRead(BaseModel):
    id: int
    candidate_id: int
    agent_name: str
    task_type: str
    status: TaskStatus
    payload: dict
    result: dict | None
    checkpoint_key: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TaskCreate(BaseModel):
    candidate_id: int
    agent_name: str
    task_type: str
    payload: dict = {}

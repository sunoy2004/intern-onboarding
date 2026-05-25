from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import date, datetime

class CandidateCreate(BaseModel):
    name: str
    email: str
    department: str
    job_title: str
    start_date: Optional[str] = None

class CandidateResponse(BaseModel):
    id: int
    user_id: int
    status: str
    department: str
    job_title: str
    start_date: Optional[date] = None
    employee_id: Optional[str] = None
    work_email: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class ExtractedDocDataSchema(BaseModel):
    candidate_id: int
    pan_number: Optional[str] = None
    aadhaar_number: Optional[str] = None
    bank_account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    full_name: Optional[str] = None
    dob: Optional[str] = None
    verification_status: Optional[str] = None
    confidence_score: float = 0.0
    signed_offer_letter: bool = False

class EventMessage(BaseModel):
    event_id: str
    event_type: str
    timestamp: float
    payload: Dict[str, Any]

import os
import logging
from datetime import datetime, timedelta, timezone
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from typing import Optional
from passlib.context import CryptContext
from jose import JWTError, jwt
import asyncpg
import httpx
import json

from agents.hr_agent.hr_agent import HRIntakeAgent
from agents.verification_agent.verification_agent import VerificationAgent

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Onboarding Gateway API", version="1.0.0")

DEFAULT_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]


def get_cors_origins() -> list[str]:
    configured = os.getenv("CORS_ALLOWED_ORIGINS") or os.getenv("FRONTEND_URL")
    if not configured:
        return DEFAULT_CORS_ORIGINS
    return [origin.strip() for origin in configured.split(",") if origin.strip()]


def get_cors_origin_regex() -> str | None:
    configured = os.getenv("CORS_ALLOW_ORIGIN_REGEX")
    if configured is not None:
        return configured or None
    return r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:password@localhost:5432/onboarding_db")
if "postgresql+asyncpg://" in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "onboarding-super-secret-key-2025")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

# Shared classes
class UserLogin(BaseModel):
    email: str
    password: str

class PasswordReset(BaseModel):
    new_password: str

class BankVerificationRequest(BaseModel):
    bank_account_number: str
    ifsc_code: str
    full_name: str

class ESignRequest(BaseModel):
    signature_data: str
    ip_address: str

class CandidateInvite(BaseModel):
    name: str
    email: str
    department: str
    job_title: str
    start_date: str

class DocumentUploadRequest(BaseModel):
    doc_type: str
    file_name: str
    file_base64: str

# Helper to verify token and return user database row
async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    email = None
    role = None
    
    # 1. Try local JWT decode
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        email = payload.get("sub")
        role = payload.get("role")
    except JWTError:
        # 2. Fallback: Verify with Supabase Auth API
        supabase_url = os.getenv("VITE_SUPABASE_URL", "https://flergklzsppmxfodskru.supabase.co")
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(
                    f"{supabase_url}/auth/v1/user",
                    headers={"Authorization": f"Bearer {token}", "apikey": os.getenv("VITE_SUPABASE_ANON_KEY", "")}
                )
                if response.status_code == 200:
                    user_data = response.json()
                    email = user_data.get("email")
                    role = user_data.get("user_metadata", {}).get("role", "candidate")
            except Exception as e:
                logger.error(f"Supabase auth check failed: {e}")

    if not email:
        raise credentials_exception

    conn = await asyncpg.connect(DATABASE_URL)
    user = await conn.fetchrow("SELECT * FROM users WHERE email = $1", email)
    await conn.close()
    
    if user is None:
        raise credentials_exception
    return dict(user)

def require_role(allowed_roles: list):
    async def dependency(current_user: dict = Depends(get_current_user)):
        if current_user["role"] not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access forbidden: requires one of roles {allowed_roles}"
            )
        return current_user
    return dependency

# Authentication Endpoints
@app.post("/auth/login")
async def login(req: UserLogin):
    conn = await asyncpg.connect(DATABASE_URL)
    user = await conn.fetchrow("SELECT * FROM users WHERE email = $1 AND is_active = true", req.email)
    await conn.close()

    if not user or not pwd_context.verify(req.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    token_payload = {"sub": user["email"], "role": user["role"], "exp": expire}
    token = jwt.encode(token_payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
            "role": user["role"],
            "reset_required": user["reset_required"]
        }
    }

@app.post("/auth/reset-password")
async def reset_password(req: PasswordReset, current_user: dict = Depends(get_current_user)):
    hashed = pwd_context.hash(req.new_password)
    conn = await asyncpg.connect(DATABASE_URL)
    await conn.execute(
        "UPDATE users SET hashed_password = $1, reset_required = false WHERE id = $2",
        hashed, current_user["id"]
    )
    await conn.close()
    return {"success": True, "message": "Password reset successfully"}

@app.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return {
        "id": current_user["id"],
        "name": current_user["name"],
        "email": current_user["email"],
        "role": current_user["role"],
        "reset_required": current_user["reset_required"]
    }

# HR dashboard routes
@app.post("/hr/invite")
async def hr_invite(req: CandidateInvite, current_user: dict = Depends(require_role(["hr", "admin"]))):
    hr_agent = HRIntakeAgent()
    result = await hr_agent.invite_candidate(
        name=req.name,
        email=req.email,
        department=req.department,
        job_title=req.job_title,
        start_date=req.start_date
    )
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result

@app.get("/hr/candidates")
async def hr_list_candidates(current_user: dict = Depends(require_role(["hr", "admin"]))):
    conn = await asyncpg.connect(DATABASE_URL)
    candidates = await conn.fetch(
        "SELECT c.*, u.name, u.email FROM candidates c JOIN users u ON c.user_id = u.id ORDER BY c.created_at DESC"
    )
    await conn.close()
    return [dict(c) for c in candidates]

@app.get("/hr/candidates/{candidate_id}/session")
async def get_candidate_session(candidate_id: int, current_user: dict = Depends(require_role(["hr", "admin"]))):
    conn = await asyncpg.connect(DATABASE_URL)
    session = await conn.fetchrow("SELECT * FROM onboarding_sessions WHERE candidate_id = $1", candidate_id)
    events = await conn.fetch("SELECT * FROM workflow_events WHERE session_id = (SELECT id FROM onboarding_sessions WHERE candidate_id = $1 LIMIT 1)", candidate_id)
    await conn.close()
    return {
        "session": dict(session) if session else None,
        "events": [dict(e) for e in events]
    }

# Candidate dashboard routes
@app.get("/candidates/me")
async def get_candidate_profile(current_user: dict = Depends(require_role(["candidate"]))):
    conn = await asyncpg.connect(DATABASE_URL)
    candidate = await conn.fetchrow("SELECT * FROM candidates WHERE user_id = $1", current_user["id"])
    cid = candidate["id"] if candidate else 0
    docs = await conn.fetchrow("SELECT * FROM extracted_document_data WHERE candidate_id = $1", cid)
    session = await conn.fetchrow("SELECT * FROM onboarding_sessions WHERE candidate_id = $1", cid)
    assets = await conn.fetch(
        "SELECT a.asset_tag, a.asset_type, a.model, a.serial_number, ia.assigned_at "
        "FROM inventory_assignments ia "
        "JOIN inventory_assets a ON ia.asset_id = a.id "
        "WHERE ia.candidate_id = $1 AND ia.returned_at IS NULL "
        "ORDER BY ia.assigned_at DESC",
        cid,
    )
    company_account = await conn.fetchrow(
        "SELECT work_email FROM company_accounts WHERE candidate_id = $1",
        cid,
    )
    v_recs = await conn.fetch(
        "SELECT DISTINCT ON (document_type) document_type, status, ocr_confidence, verification_output, created_at FROM verification_records "
        "WHERE candidate_id = $1 ORDER BY document_type, created_at DESC", cid
    )
    await conn.close()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate profile not found")
    return {
        "candidate": dict(candidate),
        "documents": dict(docs) if docs else None,
        "session": dict(session) if session else None,
        "assets": [dict(a) for a in assets],
        "company_account": dict(company_account) if company_account else None,
        "verification_records": [dict(v) for v in v_recs]
    }

@app.post("/candidates/documents/upload")
async def candidate_upload_document(
    req: DocumentUploadRequest,
    current_user: dict = Depends(require_role(["candidate"]))
):
    allowed_doc_types = {"aadhaar_card", "pan_card", "bank_passbook"}
    if req.doc_type not in allowed_doc_types:
        raise HTTPException(status_code=400, detail="Only Aadhaar card, PAN card, and bank passbook PDFs are supported")
    if not req.file_name.lower().endswith(".pdf") and "application/pdf" not in req.file_base64:
        raise HTTPException(status_code=400, detail="Only PDF uploads are supported")

    conn = await asyncpg.connect(DATABASE_URL)
    candidate = await conn.fetchrow("SELECT * FROM candidates WHERE user_id = $1", current_user["id"])
    await conn.close()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    
    verify_agent = VerificationAgent()
    
    # Process in-memory (no permanent file storage)
    result = await verify_agent.process_document_upload(
        candidate_id=candidate["id"],
        doc_type=req.doc_type,
        file_name=req.file_name,
        file_base64=req.file_base64
    )
    return result

@app.post("/candidates/bank/verify")
async def candidate_verify_bank(req: BankVerificationRequest, current_user: dict = Depends(require_role(["candidate"]))):
    conn = await asyncpg.connect(DATABASE_URL)
    candidate = await conn.fetchrow("SELECT * FROM candidates WHERE user_id = $1", current_user["id"])
    await conn.close()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    verify_agent = VerificationAgent()
    result = await verify_agent.verify_bank_details(
        candidate_id=candidate["id"],
        account_number=req.bank_account_number,
        ifsc=req.ifsc_code,
        full_name=req.full_name
    )
    return result

@app.post("/candidates/sign")
async def candidate_esign(req: ESignRequest, current_user: dict = Depends(require_role(["candidate"]))):
    conn = await asyncpg.connect(DATABASE_URL)
    candidate = await conn.fetchrow("SELECT * FROM candidates WHERE user_id = $1", current_user["id"])
    await conn.close()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    verify_agent = VerificationAgent()
    result = await verify_agent.sign_offer_letter(
        candidate_id=candidate["id"],
        signature_data=req.signature_data,
        ip_address=req.ip_address
    )
    return result

# IT Dashboard routes
@app.get("/it/candidates")
async def it_list_candidates(current_user: dict = Depends(require_role(["it", "admin"]))):
    conn = await asyncpg.connect(DATABASE_URL)
    candidates = await conn.fetch(
        "SELECT c.id as candidate_id, u.name, u.email as personal_email, c.department, c.job_title, "
        "c.status as onboarding_status, edd.pan_number, edd.aadhaar_number, edd.bank_account_number, "
        "edd.ifsc_code, edd.full_name as bank_account_name, ca.work_email as corporate_email, ca.temp_password as email_temp_password "
        "FROM candidates c "
        "JOIN users u ON c.user_id = u.id "
        "LEFT JOIN extracted_document_data edd ON c.id = edd.candidate_id "
        "LEFT JOIN company_accounts ca ON c.id = ca.candidate_id "
        "ORDER BY c.created_at DESC"
    )
    assets = await conn.fetch(
        "SELECT ia.candidate_id, a.asset_tag, a.asset_type, a.model FROM inventory_assignments ia "
        "JOIN inventory_assets a ON ia.asset_id = a.id WHERE ia.returned_at IS NULL"
    )
    await conn.close()

    # Map assets to candidates
    asset_map = {}
    for a in assets:
        cid = a["candidate_id"]
        if cid not in asset_map:
            asset_map[cid] = []
        asset_map[cid].append(dict(a))

    result = []
    for c in candidates:
        c_dict = dict(c)
        c_dict["assets"] = asset_map.get(c["candidate_id"], [])
        result.append(c_dict)

    return result

@app.get("/health")
async def health():
    return {"status": "ok"}


# Keep CORS as the outermost ASGI layer so error responses also carry CORS headers.
app = CORSMiddleware(
    app,
    allow_origins=get_cors_origins(),
    allow_origin_regex=get_cors_origin_regex(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

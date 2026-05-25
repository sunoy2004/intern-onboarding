import os
import random
import logging
import json
from datetime import datetime
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel
import asyncpg

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="IT Provisioning Service", version="1.0.0")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:password@localhost:5432/onboarding_db")
if "postgresql+asyncpg://" in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")

COMPANY_DOMAIN = os.getenv("COMPANY_DOMAIN", "company.com")

class ProvisionRequest(BaseModel):
    candidate_id: int

def generate_temp_password() -> str:
    upper = "ABCDEFGHJKLMNPQRSTUVWXYZ"
    lower = "abcdefghjkmnpqrstuvwxyz"
    nums = "23456789"
    special = "!@#$"
    all_chars = upper + lower + nums + special
    pw = ""
    pw += random.choice(upper)
    pw += random.choice(lower)
    pw += random.choice(nums)
    pw += random.choice(special)
    for _ in range(8):
        pw += random.choice(all_chars)
    return pw

@app.post("/it/provision")
async def provision_it(req: ProvisionRequest):
    logger.info(f"Provisioning IT resources for candidate {req.candidate_id}")
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        async with conn.transaction():
            candidate = await conn.fetchrow(
                "SELECT c.*, u.name as legal_name FROM candidates c JOIN users u ON c.user_id = u.id WHERE c.id = $1",
                req.candidate_id
            )
            if not candidate:
                raise HTTPException(status_code=404, detail="Candidate not found")

            existing = await conn.fetchrow(
                "SELECT * FROM company_accounts WHERE candidate_id = $1",
                req.candidate_id
            )
            if existing:
                return {
                    "employee_id": candidate["employee_id"],
                    "work_email": existing["work_email"],
                    "temp_password": existing["temp_password"]
                }

            name_parts = candidate["legal_name"].strip().lower().split()
            if len(name_parts) >= 2:
                email_prefix = f"{name_parts[0]}.{name_parts[-1]}"
            else:
                email_prefix = name_parts[0] if name_parts else "employee"

            email = f"{email_prefix}@{COMPANY_DOMAIN}"
            collision = await conn.fetchval("SELECT COUNT(*) FROM company_accounts WHERE work_email = $1", email)
            if collision > 0:
                email = f"{email_prefix}{random.randint(10, 99)}@{COMPANY_DOMAIN}"

            year = datetime.now().year
            emp_id = f"EMP-{year}-{random.randint(1000, 9999)}"
            temp_pw = generate_temp_password()

            await conn.execute(
                "INSERT INTO company_accounts (candidate_id, work_email, temp_password) VALUES ($1, $2, $3)",
                req.candidate_id, email, temp_pw
            )

            await conn.execute(
                "UPDATE candidates SET employee_id = $1, work_email = $2, status = 'it_provisioning', updated_at = now() WHERE id = $3",
                emp_id, email, req.candidate_id
            )

            await conn.execute(
                "INSERT INTO audit_logs (action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4)",
                "it_provisioned",
                "candidate",
                req.candidate_id,
                json.dumps({"employee_id": emp_id, "work_email": email}),
            )
    finally:
        await conn.close()

    return {
        "employee_id": emp_id,
        "work_email": email,
        "temp_password": temp_pw
    }

@app.get("/health")
async def health():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8005)

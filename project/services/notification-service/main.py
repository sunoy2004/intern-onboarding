import os
import logging
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel
import aiosmtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr
import asyncpg

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Notification Service", version="1.0.0")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:password@localhost:5432/onboarding_db")
if "postgresql+asyncpg://" in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")

def parse_smtp_port() -> int:
    raw_port = os.getenv("SMTP_PORT") or "587"
    try:
        return int(raw_port)
    except ValueError:
        logger.warning("Invalid SMTP_PORT=%s, falling back to 587", raw_port)
        return 587

# SMTP credentials must come from the environment. If missing, the service logs a
# sent_mock record so local development remains usable without pretending mail was sent.
SMTP_HOST = os.getenv("SMTP_HOST") or "smtp.gmail.com"
SMTP_PORT = parse_smtp_port()
SMTP_USER = os.getenv("SMTP_USER") or ""
SMTP_PASS = os.getenv("SMTP_PASSWORD") or ""
SMTP_FROM_ADDRESS = os.getenv("EMAIL_FROM") or SMTP_USER
SMTP_FROM_NAME = os.getenv("EMAIL_FROM_NAME", "MAQ Onboarding")
SMTP_FROM = SMTP_FROM_ADDRESS if "<" in SMTP_FROM_ADDRESS else formataddr((SMTP_FROM_NAME, SMTP_FROM_ADDRESS))

class EmailRequest(BaseModel):
    recipient: str
    subject: str
    body_html: str

@app.post("/notifications/send")
async def send_email(req: EmailRequest):
    logger.info(f"Notification request to: {req.recipient}, subject: {req.subject}")
    
    # Save log to DB
    conn = await asyncpg.connect(DATABASE_URL)
    
    status_str = "pending"
    
    # Check if we should actually send or skip/mock
    if not SMTP_USER or not SMTP_PASS or not SMTP_FROM or SMTP_USER == "placeholder@gmail.com" or "placeholder" in SMTP_USER:
        logger.info(f"[EMAIL MOCK] SMTP credentials not configured. To: {req.recipient}, Subject: {req.subject}")
        status_str = "sent_mock"
    else:
        try:
            msg = MIMEMultipart("alternative")
            msg["From"] = SMTP_FROM
            msg["To"] = req.recipient
            msg["Subject"] = req.subject
            msg.attach(MIMEText(req.body_html, "html"))

            await aiosmtplib.send(
                msg,
                hostname=SMTP_HOST,
                port=SMTP_PORT,
                username=SMTP_USER,
                password=SMTP_PASS,
                start_tls=True if SMTP_PORT == 587 else False,
                use_tls=True if SMTP_PORT == 465 else False,
            )
            status_str = "sent"
            logger.info(f"Email successfully sent to {req.recipient}")
        except Exception as e:
            status_str = "failed"
            logger.error(f"Failed to send email to {req.recipient}: {e}", exc_info=True)

    await conn.execute(
        "INSERT INTO email_logs (recipient, subject, status) VALUES ($1, $2, $3)",
        req.recipient, req.subject, status_str
    )
    await conn.close()

    if status_str == "failed":
        raise HTTPException(status_code=500, detail="SMTP email delivery failed.")

    return {"status": status_str, "recipient": req.recipient}

@app.get("/notifications/logs")
async def get_email_logs(limit: int = 20):
    conn = await asyncpg.connect(DATABASE_URL)
    rows = await conn.fetch(
        "SELECT id, recipient, subject, status, sent_at FROM email_logs ORDER BY id DESC LIMIT $1",
        min(max(limit, 1), 100),
    )
    await conn.close()
    return [dict(row) for row in rows]

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "smtp_configured": bool(SMTP_USER and SMTP_PASS and SMTP_FROM),
        "smtp_host": SMTP_HOST,
        "smtp_port": SMTP_PORT,
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8003)

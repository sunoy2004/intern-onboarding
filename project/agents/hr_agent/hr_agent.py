import os
import logging
import json
from datetime import date
from passlib.hash import bcrypt
import asyncpg
from event_contracts.broker import RedisEventBus

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:password@localhost:5432/onboarding_db")
if "postgresql+asyncpg://" in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")

class HRIntakeAgent:
    def __init__(self):
        self.event_bus = RedisEventBus()

    async def invite_candidate(self, name: str, email: str, department: str, job_title: str, start_date: str) -> dict:
        email = email.strip().lower()
        logger.info(f"HRIntakeAgent initiating onboarding invite for: {email}")

        common_domain_fixes = {
            "gamil.com": "gmail.com",
            "gnail.com": "gmail.com",
            "gmail.co": "gmail.com",
            "yaho.com": "yahoo.com",
            "hotmial.com": "hotmail.com",
        }
        if "@" not in email:
            return {"error": "Email address is invalid"}

        domain = email.rsplit("@", 1)[1]
        if domain in common_domain_fixes:
            suggested_email = f"{email.rsplit('@', 1)[0]}@{common_domain_fixes[domain]}"
            return {"error": f"Email domain looks misspelled. Did you mean {suggested_email}?"}

        try:
            parsed_start_date = date.fromisoformat(start_date)
        except (TypeError, ValueError):
            return {"error": "Start date must be a valid YYYY-MM-DD date"}

        # Generate temporary credentials
        import random
        upper = "ABCDEFGHJKLMNPQRSTUVWXYZ"
        lower = "abcdefghjkmnpqrstuvwxyz"
        nums = "23456789"
        special = "!@#$"
        all_chars = upper + lower + nums + special
        temp_pw = "".join([random.choice(upper), random.choice(lower), random.choice(nums), random.choice(special)] + [random.choice(all_chars) for _ in range(8)])
        
        hashed_pw = bcrypt.hash(temp_pw)

        conn = await asyncpg.connect(DATABASE_URL)
        try:
            async with conn.transaction():
                existing = await conn.fetchrow("SELECT * FROM users WHERE email = $1", email)
                if existing:
                    existing_candidate = await conn.fetchrow(
                        "SELECT id FROM candidates WHERE user_id = $1",
                        existing["id"],
                    )
                    if existing_candidate:
                        return {"error": "User with this email already exists"}

                    if existing["role"] != "candidate":
                        return {"error": "User with this email already exists"}

                    user_id = existing["id"]
                    await conn.execute(
                        "UPDATE users SET name = $1, hashed_password = $2, reset_required = true WHERE id = $3",
                        name, hashed_pw, user_id
                    )
                else:
                    user_id = await conn.fetchval(
                        "INSERT INTO users (name, email, hashed_password, role, reset_required) VALUES ($1, $2, $3, 'candidate', true) RETURNING id",
                        name, email, hashed_pw
                    )

                candidate_id = await conn.fetchval(
                    "INSERT INTO candidates (user_id, status, department, job_title, start_date) VALUES ($1, 'applied', $2, $3, $4) RETURNING id",
                    user_id, department, job_title, parsed_start_date
                )

                session_id = await conn.fetchval(
                    "INSERT INTO onboarding_sessions (candidate_id, current_step, status) VALUES ($1, 'initiated', 'in_progress') RETURNING id",
                    candidate_id
                )

                await conn.execute(
                    "INSERT INTO audit_logs (action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4)",
                    "onboarding_initiated",
                    "candidate",
                    candidate_id,
                    json.dumps({"name": name, "email": email}),
                )
        finally:
            await conn.close()

        # Publish event
        event_published = True
        try:
            await self.event_bus.publish_event("CandidateCreatedEvent", {
                "candidate_id": candidate_id,
                "session_id": session_id,
                "name": name,
                "email": email,
                "department": department,
                "job_title": job_title,
                "temp_password": temp_pw,
                "start_date": parsed_start_date.isoformat()
            })
        except Exception:
            event_published = False
            logger.exception("Candidate invite created, but event publish failed")

        return {
            "success": True,
            "candidate_id": candidate_id,
            "session_id": session_id,
            "temp_password": temp_pw,
            "event_published": event_published
        }

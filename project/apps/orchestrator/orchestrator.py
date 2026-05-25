import os
import asyncio
import logging
import json
import asyncpg
from event_contracts.broker import RedisEventBus
from agents.notification_agent.notification_agent import NotificationAgent
from agents.it_agent.it_agent import ITAgent
from agents.inventory_agent.inventory_agent import InventoryAgent
from passlib.hash import bcrypt

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:password@localhost:5432/onboarding_db")
if "postgresql+asyncpg://" in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")

class Orchestrator:
    def __init__(self):
        self.event_bus = RedisEventBus()
        self.notifier = NotificationAgent()
        self.it_agent = ITAgent()
        self.inventory_agent = InventoryAgent()

    async def handle_event(self, event: dict):
        event_type = event.get("event_type")
        payload = event.get("payload", {})
        candidate_id = payload.get("candidate_id")
        session_id = payload.get("session_id")
        
        logger.info(f"Orchestrator processing {event_type} for candidate {candidate_id}")
        
        conn = await asyncpg.connect(DATABASE_URL)

        # Log event to database
        if session_id:
            await conn.execute(
                "INSERT INTO workflow_events (session_id, event_type, payload, processed_by) "
                "VALUES ($1, $2, $3, $4)",
                session_id, event_type, json.dumps(payload), "orchestrator"
            )

        if event_type == "CandidateCreatedEvent":
            # 1. Send invite email with temporary password
            success = await self.notifier.send_welcome_email(
                payload["email"], payload["name"], payload["temp_password"]
            )
            
            # 2. Update session state
            if session_id:
                step_name = "welcome_email_sent" if success else "welcome_email_failed"
                await conn.execute(
                    "UPDATE onboarding_sessions SET current_step = $1, "
                    "step_history = step_history || to_jsonb($1::text), "
                    "updated_at = now() WHERE id = $2",
                    step_name, session_id
                )
            logger.info(f"CandidateCreatedEvent processed (email_sent={success})")

        elif event_type == "VerificationCompletedEvent":
            # 1. Fire IT provisioning and Inventory assignment concurrently
            logger.info(f"Verification completed. Triggering IT and Inventory agents for candidate {candidate_id}")
            
            async def run_it():
                try:
                    await self.it_agent.provision_employee_account(candidate_id, session_id)
                except Exception as e:
                    logger.error(f"IT Agent provisioning failed: {e}", exc_info=True)
                    raise
                    
            async def run_inventory():
                try:
                    await self.inventory_agent.assign_assets(candidate_id, session_id)
                except Exception as e:
                    logger.error(f"Inventory Agent assignment failed: {e}", exc_info=True)
                    raise

            # Run both in parallel
            await asyncio.gather(run_it(), run_inventory())
            
            # Update session step
            if session_id:
                await conn.execute(
                    "UPDATE onboarding_sessions SET current_step = 'provisioning_triggered', "
                    "step_history = step_history || '\"provisioning_triggered\"'::jsonb, "
                    "updated_at = now() WHERE id = $1",
                    session_id
                )

        elif event_type == "ITAccountProvisionedEvent":
            # 1. Update candidate status and set corporate email credentials
            work_email = payload["work_email"]
            temp_password = payload["temp_password"]
            hashed_pw = bcrypt.hash(temp_password)

            # Retrieve candidate's personal email
            personal_email = await conn.fetchval(
                "SELECT email FROM users u JOIN candidates c ON c.user_id = u.id WHERE c.id = $1",
                candidate_id
            )

            candidate_name = await conn.fetchval(
                "SELECT name FROM users u JOIN candidates c ON c.user_id = u.id WHERE c.id = $1",
                candidate_id
            )

            # 2. Dispatch notification email to personal email address before switching login.
            # If SMTP fails, the candidate can still use their personal-email login.
            success = False
            if personal_email:
                success = await self.notifier.send_company_account_credentials(
                    personal_email, candidate_name, work_email, temp_password
                )
                logger.info(f"Corporate account credential email result for {personal_email}: {success}")

            if not success:
                await conn.execute(
                    "INSERT INTO audit_logs (action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4)",
                    "company_credentials_email_failed",
                    "candidate",
                    candidate_id,
                    json.dumps({"personal_email": personal_email, "work_email": work_email}),
                )
                logger.error("Corporate email login was not assigned because credentials email failed for candidate %s", candidate_id)
                await self._check_workflow_completion(candidate_id, session_id, conn)
                return

            # Update existing user record with the corporate email & forced temp password reset flag
            # This allows them to login using the corporate email on first login.
            await conn.execute(
                "UPDATE users SET email = $1, hashed_password = $2, reset_required = true "
                "WHERE id = (SELECT user_id FROM candidates WHERE id = $3)",
                work_email, hashed_pw, candidate_id
            )

            # Update candidate status
            await conn.execute(
                "UPDATE candidates SET status = 'it_provisioning', updated_at = now() "
                "WHERE id = $1",
                candidate_id
            )

            # 3. Check if workflow is complete (both IT and Inventory assigned)
            await self._check_workflow_completion(candidate_id, session_id, conn)

        elif event_type == "InventoryAssignedEvent":
            # 1. Check if workflow is complete (both IT and Inventory assigned)
            await self._check_workflow_completion(candidate_id, session_id, conn)

        await conn.close()

    async def _check_workflow_completion(self, candidate_id: int, session_id: int, conn):
        # Check if laptop is assigned
        laptop_assigned = await conn.fetchval(
            "SELECT COUNT(*) FROM inventory_assignments ia JOIN inventory_assets a ON ia.asset_id = a.id "
            "WHERE ia.candidate_id = $1 AND a.asset_type = 'laptop' AND ia.returned_at IS NULL",
            candidate_id
        )
        
        # Check if IT account is provisioned
        account_provisioned = await conn.fetchval(
            "SELECT COUNT(*) FROM company_accounts WHERE candidate_id = $1",
            candidate_id
        )

        logger.info(f"Completion check for candidate {candidate_id}: Laptop={laptop_assigned}, Account={account_provisioned}")

        if laptop_assigned > 0 and account_provisioned > 0:
            # Complete onboarding workflow!
            await conn.execute(
                "UPDATE candidates SET status = 'onboarded', updated_at = now() WHERE id = $1",
                candidate_id
            )
            if session_id:
                await conn.execute(
                    "UPDATE onboarding_sessions SET status = 'completed', current_step = 'completed', "
                    "step_history = step_history || '\"completed\"'::jsonb, "
                    "updated_at = now() WHERE id = $1",
                    session_id
                )
                
            # Log audit trail
            await conn.execute(
                "INSERT INTO audit_logs (action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4)",
                "onboarding_completed", "candidate", candidate_id, '{"auto_completed": true}'
            )
            logger.info(f"Onboarding workflow completed and candidate {candidate_id} status updated to onboarded!")

    async def start(self):
        await self.event_bus.connect()
        await self.event_bus.listen_events(self.handle_event)

if __name__ == "__main__":
    orchestrator = Orchestrator()
    asyncio.run(orchestrator.start())

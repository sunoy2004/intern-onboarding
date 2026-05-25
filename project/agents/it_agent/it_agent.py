import os
import logging
import httpx
from event_contracts.broker import RedisEventBus

logger = logging.getLogger(__name__)

IT_SERVICE_URL = os.getenv("IT_SERVICE_URL", "http://localhost:8005")

class ITAgent:
    def __init__(self):
        self.event_bus = RedisEventBus()

    async def provision_employee_account(self, candidate_id: int, session_id: int = None) -> dict:
        logger.info(f"ITAgent provisioning account for candidate {candidate_id}")
        
        async with httpx.AsyncClient() as client:
            payload = {"candidate_id": candidate_id}
            response = await client.post(
                f"{IT_SERVICE_URL}/it/provision",
                json=payload,
                timeout=20.0
            )
            
            if response.status_code != 200:
                raise Exception(f"IT Service account provisioning failed: {response.text}")
                
            provision_data = response.json()

        # Publish ITAccountProvisionedEvent
        await self.event_bus.publish_event("ITAccountProvisionedEvent", {
            "candidate_id": candidate_id,
            "session_id": session_id,
            "employee_id": provision_data["employee_id"],
            "work_email": provision_data["work_email"],
            "temp_password": provision_data["temp_password"]
        })
        logger.info(f"ITAccountProvisionedEvent published for candidate {candidate_id}")
        return provision_data

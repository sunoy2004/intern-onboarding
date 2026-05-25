import os
import logging
import httpx
from event_contracts.broker import RedisEventBus

logger = logging.getLogger(__name__)

INVENTORY_SERVICE_URL = os.getenv("INVENTORY_SERVICE_URL", "http://localhost:8004")

class InventoryAgent:
    def __init__(self):
        self.event_bus = RedisEventBus()

    async def assign_assets(self, candidate_id: int, session_id: int = None) -> dict:
        logger.info(f"InventoryAgent assigning assets for candidate {candidate_id}")
        
        assigned_assets = []
        
        # 1. Assign laptop
        async with httpx.AsyncClient() as client:
            payload = {"candidate_id": candidate_id, "asset_type": "laptop"}
            response = await client.post(
                f"{INVENTORY_SERVICE_URL}/inventory/assign",
                json=payload,
                timeout=15.0
            )
            if response.status_code == 200:
                laptop_data = response.json()
                assigned_assets.append(laptop_data.get("asset", {}))

        # 2. Assign standard monitor accessory
        async with httpx.AsyncClient() as client:
            payload = {"candidate_id": candidate_id, "asset_type": "accessories"}
            response = await client.post(
                f"{INVENTORY_SERVICE_URL}/inventory/assign",
                json=payload,
                timeout=15.0
            )
            if response.status_code == 200:
                acc_data = response.json()
                assigned_assets.append(acc_data.get("asset", {}))

        # Publish InventoryAssignedEvent
        await self.event_bus.publish_event("InventoryAssignedEvent", {
            "candidate_id": candidate_id,
            "session_id": session_id,
            "assets": assigned_assets
        })
        logger.info(f"InventoryAssignedEvent published for candidate {candidate_id}")
        return {"assigned_assets": assigned_assets}

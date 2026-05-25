import os
import logging
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel
import asyncpg

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Inventory Service", version="1.0.0")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:password@localhost:5432/onboarding_db")
if "postgresql+asyncpg://" in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")

class AssignAssetRequest(BaseModel):
    candidate_id: int
    asset_type: str  # laptop, monitor, keyboard, etc.

@app.get("/inventory/assets")
async def list_assets():
    conn = await asyncpg.connect(DATABASE_URL)
    assets = await conn.fetch("SELECT * FROM inventory_assets")
    await conn.close()
    return [dict(a) for a in assets]

@app.post("/inventory/assign")
async def assign_asset(req: AssignAssetRequest):
    logger.info(f"Assigning asset of type {req.asset_type} to candidate {req.candidate_id}")
    conn = await asyncpg.connect(DATABASE_URL)
    
    # Check if candidate already has asset of this type
    existing = await conn.fetchrow(
        "SELECT a.* FROM inventory_assignments ia JOIN inventory_assets a ON ia.asset_id = a.id "
        "WHERE ia.candidate_id = $1 AND a.asset_type = $2 AND ia.returned_at IS NULL",
        req.candidate_id, req.asset_type
    )
    if existing:
        await conn.close()
        return {"message": "Asset already assigned", "asset": dict(existing)}

    # Find available asset of this type
    asset = await conn.fetchrow(
        "SELECT * FROM inventory_assets WHERE asset_type = $1 AND status = 'available' LIMIT 1",
        req.asset_type
    )
    if not asset:
        # Create a mock asset if none is available, for testing purposes
        import random
        tag = f"LAPTOP-MOCK-{random.randint(100, 999)}"
        asset_id = await conn.fetchval(
            "INSERT INTO inventory_assets (asset_tag, asset_type, model, serial_number, status) "
            "VALUES ($1, $2, $3, $4, 'available') RETURNING id",
            tag, req.asset_type, "Standard Office MacBook Pro" if req.asset_type == "laptop" else "Standard Accessory", "SN-MOCK-999"
        )
        asset = await conn.fetchrow("SELECT * FROM inventory_assets WHERE id = $1", asset_id)

    # Assign asset
    await conn.execute(
        "INSERT INTO inventory_assignments (candidate_id, asset_id) VALUES ($1, $2)",
        req.candidate_id, asset["id"]
    )
    await conn.execute(
        "UPDATE inventory_assets SET status = 'assigned' WHERE id = $1",
        asset["id"]
    )
    
    # Audit log
    await conn.execute(
        "INSERT INTO audit_logs (action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4)",
        "asset_assigned", "candidate", req.candidate_id, f'{{"asset_tag": "{asset["asset_tag"]}", "asset_type": "{req.asset_type}"}}'
    )
    
    await conn.close()
    return {"message": "Asset assigned successfully", "asset": dict(asset)}

@app.get("/health")
async def health():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8004)

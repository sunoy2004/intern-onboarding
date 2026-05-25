"""One-time schema + seed for Supabase (or any remote Postgres requiring SSL)."""
import asyncio
import os
import sys

import asyncpg
from passlib.hash import bcrypt

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "packages", "shared_utils"))

from init_db import INIT_SQL  # noqa: E402

DATABASE_URL = os.getenv("DATABASE_URL", "")
if not DATABASE_URL:
    raise SystemExit("Set DATABASE_URL before running this script.")


async def connect():
    return await asyncpg.connect(DATABASE_URL, ssl="require")


async def seed(conn):
    admin_pw = bcrypt.hash("Admin@123")
    hr_pw = bcrypt.hash("Hr@12345")
    it_pw = bcrypt.hash("It@12345")
    mgr_pw = bcrypt.hash("Manager@123")
    cand_pw = bcrypt.hash("Candidate@123")

    users = [
        ("Admin User", "admin@company.com", admin_pw, "admin"),
        ("HR Manager", "hr1@company.com", hr_pw, "hr"),
        ("IT Specialist", "it1@company.com", it_pw, "it"),
        ("Engineering Manager", "manager1@company.com", mgr_pw, "manager"),
        ("John Candidate", "candidate1@company.com", cand_pw, "candidate"),
    ]

    user_ids = {}
    for name, email, pw, role in users:
        user_id = await conn.fetchval(
            "INSERT INTO users (name, email, hashed_password, role) "
            "VALUES ($1, $2, $3, $4) ON CONFLICT (email) DO UPDATE SET name=$1 RETURNING id",
            name, email, pw, role,
        )
        user_ids[email] = user_id
        print(f"User: {email} -> ID: {user_id}")

    candidate_id = await conn.fetchval(
        "INSERT INTO candidates (user_id, status, department, job_title) "
        "VALUES ($1, 'applied', 'Engineering', 'Software Engineer') "
        "ON CONFLICT (user_id) DO UPDATE SET status='applied' RETURNING id",
        user_ids["candidate1@company.com"],
    )
    print(f"Candidate: candidate1@company.com -> ID: {candidate_id}")

    assets = [
        ("LAPTOP-001", "laptop", "MacBook Pro 16", "SN-MBP16-001"),
        ("LAPTOP-002", "laptop", "ThinkPad X1 Carbon", "SN-TPX1-002"),
        ("LAPTOP-003", "laptop", "Dell XPS 15", "SN-DXPS15-003"),
        ("ACC-001", "accessories", "Dell 24 Monitor", "SN-MON-001"),
        ("ACC-002", "accessories", "Apple Magic Keyboard & Mouse", "SN-KYBD-002"),
        ("ACC-003", "accessories", "Logitech MX Master 3", "SN-MXM3-003"),
    ]
    for tag, asset_type, model, serial in assets:
        await conn.execute(
            "INSERT INTO inventory_assets (asset_tag, asset_type, model, serial_number, status) "
            "VALUES ($1, $2, $3, $4, 'available') ON CONFLICT (asset_tag) DO NOTHING",
            tag, asset_type, model, serial,
        )
        print(f"Asset: {tag} seeded.")


async def main():
    print("Connecting to Supabase...")
    conn = await connect()
    print("Initializing schema (drops existing tables)...")
    await conn.execute(INIT_SQL)
    print("Schema ready. Seeding demo data...")
    await seed(conn)
    await conn.close()
    print("Bootstrap completed successfully!")


if __name__ == "__main__":
    asyncio.run(main())

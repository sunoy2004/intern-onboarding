import asyncio
import os
import sys
import asyncpg
from passlib.hash import bcrypt

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:password@localhost:5432/onboarding_db")
if "postgresql+asyncpg://" in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")

async def seed():
    conn = await asyncpg.connect(DATABASE_URL)
    
    # Hash password
    admin_pw = bcrypt.hash("Admin@123")
    hr_pw = bcrypt.hash("Hr@12345")
    it_pw = bcrypt.hash("It@12345")
    mgr_pw = bcrypt.hash("Manager@123")
    cand_pw = bcrypt.hash("Candidate@123")

    # Create users
    users = [
        ("Admin User", "admin@company.com", admin_pw, "admin"),
        ("HR Manager", "hr1@company.com", hr_pw, "hr"),
        ("IT Specialist", "it1@company.com", it_pw, "it"),
        ("Engineering Manager", "manager1@company.com", mgr_pw, "manager"),
        ("John Candidate", "candidate1@company.com", cand_pw, "candidate")
    ]
    
    print("Seeding users...")
    user_ids = {}
    for name, email, pw, role in users:
        user_id = await conn.fetchval(
            "INSERT INTO users (name, email, hashed_password, role) VALUES ($1, $2, $3, $4) ON CONFLICT (email) DO UPDATE SET name=$1 RETURNING id",
            name, email, pw, role
        )
        user_ids[email] = user_id
        print(f"User: {email} -> ID: {user_id}")

    # Create candidate
    print("Seeding candidate...")
    candidate_id = await conn.fetchval(
        "INSERT INTO candidates (user_id, status, department, job_title) VALUES ($1, 'applied', 'Engineering', 'Software Engineer') ON CONFLICT (user_id) DO UPDATE SET status='applied' RETURNING id",
        user_ids["candidate1@company.com"]
    )
    print(f"Candidate: candidate1@company.com -> ID: {candidate_id}")

    # Seed inventory assets
    print("Seeding inventory assets...")
    assets = [
        ("LAPTOP-001", "laptop", "MacBook Pro 16", "SN-MBP16-001"),
        ("LAPTOP-002", "laptop", "ThinkPad X1 Carbon", "SN-TPX1-002"),
        ("LAPTOP-003", "laptop", "Dell XPS 15", "SN-DXPS15-003"),
        ("ACC-001", "accessories", "Dell 24 Monitor", "SN-MON-001"),
        ("ACC-002", "accessories", "Apple Magic Keyboard & Mouse", "SN-KYBD-002"),
        ("ACC-003", "accessories", "Logitech MX Master 3", "SN-MXM3-003")
    ]
    
    for tag, asset_type, model, serial in assets:
        await conn.execute(
            "INSERT INTO inventory_assets (asset_tag, asset_type, model, serial_number, status) VALUES ($1, $2, $3, $4, 'available') ON CONFLICT (asset_tag) DO NOTHING",
            tag, asset_type, model, serial
        )
        print(f"Asset: {tag} ({model}) seeded.")

    # Seed training modules
    print("Seeding training modules...")
    modules = [
        ("Company Orientation", "Learn about company culture, mission, values, and organizational structure.", None, 2.0, 1, True),
        ("Security & Compliance Training", "Understanding data security policies, compliance requirements, and workplace safety.", None, 3.0, 2, True),
        ("Engineering Onboarding", "Technical stack overview, development workflows, code review process, and CI/CD pipeline.", "Engineering", 4.0, 3, True),
        ("HR Tools & Systems", "Overview of HR management systems, payroll, benefits administration, and employee self-service portals.", "HR", 3.0, 3, True),
    ]

    for name, desc, dept, hours, order, mandatory in modules:
        await conn.execute(
            "INSERT INTO training_modules (name, description, department, duration_hours, order_index, is_mandatory) VALUES ($1, $2, $3, $4, $5, $6)",
            name, desc, dept, hours, order, mandatory
        )
        print(f"Module: {name} seeded.")

    await conn.close()
    print("Seeding completed successfully!")

if __name__ == "__main__":
    asyncio.run(seed())

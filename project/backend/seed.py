import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from passlib.context import CryptContext
from database import async_session
from models.user import User, UserRole
from models.candidate import Candidate, CandidateStatus
from models.training import TrainingModule

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


async def seed():
    async with async_session() as db:
        # Create users
        users_data = [
            ("Admin User", "admin@company.com", "Admin@123", UserRole.admin),
            ("HR Manager", "hr1@company.com", "Hr@12345", UserRole.hr),
            ("IT Admin", "it1@company.com", "It@12345", UserRole.it),
            ("Team Manager", "manager1@company.com", "Manager@123", UserRole.manager),
            ("John Candidate", "candidate1@company.com", "Candidate@123", UserRole.candidate),
        ]

        created_users = []
        for name, email, password, role in users_data:
            from sqlalchemy import select
            result = await db.execute(select(User).where(User.email == email))
            existing = result.scalar_one_or_none()
            if existing:
                print(f"User {email} already exists, skipping")
                created_users.append(existing)
                continue

            user = User(
                name=name,
                email=email,
                hashed_password=pwd_context.hash(password),
                role=role,
            )
            db.add(user)
            await db.flush()
            created_users.append(user)
            print(f"Created user: {email} ({role.value})")

        # Create candidate profile for candidate user
        candidate_user = created_users[4]
        result = await db.execute(
            select(Candidate).where(Candidate.user_id == candidate_user.id)
        )
        if not result.scalar_one_or_none():
            candidate = Candidate(
                user_id=candidate_user.id,
                status=CandidateStatus.applied,
                department="Engineering",
                job_title="Software Engineer",
            )
            db.add(candidate)
            await db.flush()
            print(f"Created candidate profile for {candidate_user.email}")

        # Create sample training modules
        modules_data = [
            ("Company Orientation", "Learn about company culture, mission, values, and organizational structure.", None, 2.0, 1, True),
            ("Security & Compliance Training", "Understanding data security policies, compliance requirements, and workplace safety.", None, 3.0, 2, True),
            ("Engineering Onboarding", "Technical stack overview, development workflows, code review process, and CI/CD pipeline.", "Engineering", 4.0, 3, True),
            ("HR Tools & Systems", "Overview of HR management systems, payroll, benefits administration, and employee self-service portals.", "HR", 3.0, 3, True),
        ]

        for name, desc, dept, hours, order, mandatory in modules_data:
            result = await db.execute(select(TrainingModule).where(TrainingModule.name == name))
            if not result.scalar_one_or_none():
                module = TrainingModule(
                    name=name,
                    description=desc,
                    department=dept,
                    duration_hours=hours,
                    order_index=order,
                    is_mandatory=mandatory,
                )
                db.add(module)
                print(f"Created training module: {name}")

        await db.commit()

    print("\nSeed complete!")
    print("Login credentials:")
    print("  admin@company.com / Admin@123")
    print("  hr1@company.com / Hr@12345")
    print("  it1@company.com / It@12345")
    print("  manager1@company.com / Manager@123")
    print("  candidate1@company.com / Candidate@123")
    print("\nAPI docs at http://localhost:8000/docs")


if __name__ == "__main__":
    asyncio.run(seed())

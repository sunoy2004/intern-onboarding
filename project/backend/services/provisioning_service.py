import logging
import random

from sqlalchemy.ext.asyncio import AsyncSession

from models.candidate import Candidate
from models.provisioning import ProvisioningLog, ResourceType

logger = logging.getLogger(__name__)


class ProvisioningService:
    """Mock IT provisioning service. All methods write to ProvisioningLog table."""

    async def generate_employee_id(self, candidate: Candidate, db: AsyncSession) -> str:
        from datetime import datetime
        year = datetime.now().year
        num = random.randint(1000, 9999)
        employee_id = f"EMP-{year}-{num}"

        log = ProvisioningLog(
            candidate_id=candidate.id,
            resource_type=ResourceType.employee_id,
            resource_value=employee_id,
            provisioned_by_agent="it_agent",
        )
        db.add(log)
        await db.flush()

        logger.info(f"Generated employee ID: {employee_id} for candidate {candidate.id}")
        return employee_id

    async def create_work_email(self, candidate: Candidate, db: AsyncSession) -> str:
        name_parts = candidate.user.name.lower().split()
        if len(name_parts) >= 2:
            email_prefix = f"{name_parts[0]}.{name_parts[-1]}"
        else:
            email_prefix = name_parts[0] if name_parts else "employee"

        work_email = f"{email_prefix}@company.com"

        # Check for duplicates by adding a number suffix
        from sqlalchemy import select, func
        result = await db.execute(
            select(func.count()).select_from(ProvisioningLog).where(
                ProvisioningLog.resource_type == ResourceType.work_email,
                ProvisioningLog.resource_value.startswith(work_email.split("@")[0]),
            )
        )
        count = result.scalar() or 0
        if count > 0:
            work_email = f"{email_prefix}{count + 1}@company.com"

        log = ProvisioningLog(
            candidate_id=candidate.id,
            resource_type=ResourceType.work_email,
            resource_value=work_email,
            provisioned_by_agent="it_agent",
        )
        db.add(log)
        await db.flush()

        logger.info(f"Created work email: {work_email} for candidate {candidate.id}")
        return work_email

    async def assign_laptop(self, candidate: Candidate, db: AsyncSession) -> str:
        asset_tag = f"LAPTOP-{random.randint(100000, 999999)}"

        log = ProvisioningLog(
            candidate_id=candidate.id,
            resource_type=ResourceType.laptop,
            resource_value=asset_tag,
            provisioned_by_agent="it_agent",
        )
        db.add(log)
        await db.flush()

        logger.info(f"Assigned laptop: {asset_tag} for candidate {candidate.id}")
        return asset_tag

    async def provision_software(self, candidate: Candidate, software_list: list, db: AsyncSession) -> list:
        results = []
        for software in software_list:
            license_key = f"KEY-{random.randint(100000, 999999)}"
            log = ProvisioningLog(
                candidate_id=candidate.id,
                resource_type=ResourceType.software_access,
                resource_value=f"{software}|{license_key}",
                provisioned_by_agent="it_agent",
            )
            db.add(log)
            results.append({"software": software, "license_key": license_key, "status": "provisioned"})

        await db.flush()
        logger.info(f"Provisioned {len(software_list)} software items for candidate {candidate.id}")
        return results

    async def create_access_card(self, candidate: Candidate, db: AsyncSession) -> str:
        card_number = f"AC-{random.randint(10000000, 99999999)}"

        log = ProvisioningLog(
            candidate_id=candidate.id,
            resource_type=ResourceType.access_card,
            resource_value=card_number,
            provisioned_by_agent="it_agent",
        )
        db.add(log)
        await db.flush()

        logger.info(f"Created access card: {card_number} for candidate {candidate.id}")
        return card_number

import logging

from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

OFFER_LETTER_TEMPLATE = """
<html><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
<h2 style="color: #1a365d;">Offer Letter</h2>
<p>Dear {candidate_name},</p>
<p>We are delighted to offer you the position of <strong>{job_title}</strong> at our company.</p>
<p><strong>Start Date:</strong> {start_date}</p>
<p><strong>Department:</strong> {department}</p>
{offer_details}
<p>We look forward to welcoming you aboard!</p>
<p>Best regards,<br>HR Team</p>
</body></html>
"""

APPROVAL_REQUEST_TEMPLATE = """
<html><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
<h2 style="color: #9b2c2c;">Approval Required</h2>
<p>An action requires your approval:</p>
<p><strong>Action:</strong> {action_type}</p>
<p><strong>Approval ID:</strong> {approval_id}</p>
<p>Please log in to the onboarding portal to review and approve or reject this request.</p>
</body></html>
"""

REMINDER_TEMPLATE = """
<html><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
<h2 style="color: #2d3748;">Onboarding Reminder</h2>
<p>Dear {candidate_name},</p>
<p>This is a reminder that the following items are pending:</p>
<ul>{pending_items}</ul>
<p>Please complete these at your earliest convenience.</p>
</body></html>
"""

TRAINING_REMINDER_TEMPLATE = """
<html><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
<h2 style="color: #2d3748;">Training Reminder</h2>
<p>Dear {candidate_name},</p>
<p>You have the following overdue training modules:</p>
<ul>{overdue_modules}</ul>
<p>Please complete them as soon as possible.</p>
</body></html>
"""

WELCOME_EMAIL_TEMPLATE = """
<html><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
<h2 style="color: #1a365d;">Welcome Aboard!</h2>
<p>Dear {candidate_name},</p>
<p>Your IT resources have been provisioned:</p>
<ul><li><strong>Employee ID:</strong> {employee_id}</li>
<li><strong>Work Email:</strong> {work_email}</li></ul>
<p>Your onboarding is progressing well. Please complete your training modules at your earliest convenience.</p>
<p>Welcome to the team!</p>
</body></html>
"""


class EmailService:
    async def send_email(self, to: str, subject: str, body_html: str) -> bool:
        if not settings.SMTP_USER or settings.SMTP_USER == "placeholder@gmail.com":
            logger.info(f"[EMAIL SKIPPED] To: {to}, Subject: {subject}")
            return True

        try:
            import aiosmtplib
            from email.mime.multipart import MIMEMultipart
            from email.mime.text import MIMEText

            msg = MIMEMultipart("alternative")
            msg["From"] = settings.EMAIL_FROM
            msg["To"] = to
            msg["Subject"] = subject
            msg.attach(MIMEText(body_html, "html"))

            await aiosmtplib.send(
                msg,
                hostname=settings.SMTP_HOST,
                port=settings.SMTP_PORT,
                username=settings.SMTP_USER,
                password=settings.SMTP_PASSWORD,
                use_tls=True,
            )
            logger.info(f"Email sent to {to}: {subject}")
            return True
        except Exception as e:
            logger.error(f"Failed to send email to {to}: {e}")
            return False

    async def send_offer_letter(self, candidate_email: str, candidate_name: str,
                                 job_title: str, start_date: str, offer_details: dict = None) -> bool:
        details_html = ""
        if offer_details:
            details_html = "<p><strong>Offer Details:</strong></p><ul>"
            for k, v in offer_details.items():
                details_html += f"<li>{k}: {v}</li>"
            details_html += "</ul>"

        body = OFFER_LETTER_TEMPLATE.format(
            candidate_name=candidate_name,
            job_title=job_title,
            start_date=start_date,
            department=offer_details.get("department", "N/A") if offer_details else "N/A",
            offer_details=details_html,
        )
        return await self.send_email(candidate_email, f"Offer Letter - {job_title}", body)

    async def send_approval_request(self, approver_email: str, action_type: str,
                                     approval_id: int, payload: dict = None) -> bool:
        body = APPROVAL_REQUEST_TEMPLATE.format(
            action_type=action_type,
            approval_id=approval_id,
        )
        return await self.send_email(approver_email, f"Approval Required: {action_type}", body)

    async def send_onboarding_reminder(self, candidate_email: str, candidate_name: str,
                                        pending_items: list) -> bool:
        items_html = "".join(f"<li>{item}</li>" for item in pending_items)
        body = REMINDER_TEMPLATE.format(
            candidate_name=candidate_name,
            pending_items=items_html,
        )
        return await self.send_email(candidate_email, "Onboarding Items Pending", body)

    async def send_training_reminder(self, candidate_email: str, candidate_name: str,
                                      overdue_modules: list) -> bool:
        modules_html = "".join(f"<li>{mod}</li>" for mod in overdue_modules)
        body = TRAINING_REMINDER_TEMPLATE.format(
            candidate_name=candidate_name,
            overdue_modules=modules_html,
        )
        return await self.send_email(candidate_email, "Overdue Training Modules", body)

    async def send_welcome_email(self, candidate_email: str, candidate_name: str,
                                  employee_id: str, work_email: str) -> bool:
        body = WELCOME_EMAIL_TEMPLATE.format(
            candidate_name=candidate_name,
            employee_id=employee_id,
            work_email=work_email,
        )
        return await self.send_email(candidate_email, "Welcome Aboard! Your Credentials", body)

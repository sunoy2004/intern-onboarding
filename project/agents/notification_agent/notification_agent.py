import os
import logging
import httpx

logger = logging.getLogger(__name__)

NOTIFICATION_SERVICE_URL = os.getenv("NOTIFICATION_SERVICE_URL", "http://localhost:8003")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

class NotificationAgent:
    async def send_welcome_email(self, email: str, name: str, temp_password: str) -> bool:
        logger.info(f"NotificationAgent sending welcome/invite email to {email}")
        
        subject = "Welcome to the team! Your Offer Letter & Onboarding Portal"
        body_html = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
            <h2 style="color: #1e3a8a;">Welcome to the Team!</h2>
            <p>Dear {name},</p>
            <p>We are excited to welcome you. Your onboarding process has officially started.</p>
            <p>Please log in to your onboarding portal to review your offer letter, e-sign the document, and upload your KYC documents as PDFs.</p>
            
            <div style="background-color: #fef3c7; border: 1px solid #f59e0b; padding: 15px; border-radius: 6px; margin: 20px 0;">
                <h4 style="margin: 0 0 10px 0; color: #b45309;">Your Temporary Credentials:</h4>
                <p style="margin: 5px 0;"><strong>Portal URL:</strong> <a href="{FRONTEND_URL}">{FRONTEND_URL}</a></p>
                <p style="margin: 5px 0;"><strong>Username:</strong> {email}</p>
                <p style="margin: 5px 0;"><strong>Temporary Password:</strong> {temp_password}</p>
                <p style="margin: 10px 0 0 0; font-size: 12px; color: #b45309;"><em>Note: Upload only Aadhaar card, PAN card, and bank passbook/cancelled cheque PDFs. Bank details are extracted automatically.</em></p>
            </div>
            
            <p>Best regards,<br/>Human Resources Team</p>
        </div>
        """
        
        return await self._dispatch_email(email, subject, body_html)

    async def send_company_account_credentials(self, personal_email: str, name: str, work_email: str, temp_password: str) -> bool:
        logger.info(f"NotificationAgent sending corporate credentials to {personal_email}")
        
        subject = "Corporate IT Account Provisioned - Welcome to your Corporate Workspace"
        body_html = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
            <h2 style="color: #10b981;">Your Work Account is Ready!</h2>
            <p>Dear {name},</p>
            <p>Congratulations! Your documents have been successfully verified, and your corporate accounts have been provisioned.</p>
            
            <div style="background-color: #d1fae5; border: 1px solid #10b981; padding: 15px; border-radius: 6px; margin: 20px 0;">
                <h4 style="margin: 0 0 10px 0; color: #065f46;">Corporate Login Credentials:</h4>
                <p style="margin: 5px 0;"><strong>Corporate Email:</strong> {work_email}</p>
                <p style="margin: 5px 0;"><strong>Temporary Password:</strong> {temp_password}</p>
            </div>
            
            <p>Please log in using your new corporate email on your next login attempt to reset your password and access your employee dashboard.</p>
            
            <p>Welcome to our workspace!</p>
            <p>Best regards,<br/>IT Services Desk</p>
        </div>
        """
        
        return await self._dispatch_email(personal_email, subject, body_html)

    async def _dispatch_email(self, recipient: str, subject: str, body_html: str) -> bool:
        async with httpx.AsyncClient() as client:
            try:
                payload = {
                    "recipient": recipient,
                    "subject": subject,
                    "body_html": body_html
                }
                response = await client.post(
                    f"{NOTIFICATION_SERVICE_URL}/notifications/send",
                    json=payload,
                    timeout=15.0
                )
                if response.status_code != 200:
                    logger.error(
                        "Notification service rejected email to %s with %s: %s",
                        recipient,
                        response.status_code,
                        response.text,
                    )
                    return False
                result = response.json()
                logger.info(
                    "Notification service accepted email to %s with status=%s",
                    recipient,
                    result.get("status"),
                )
                return True
            except Exception as e:
                logger.error(f"Failed to dispatch email notification: {e}")
                return False

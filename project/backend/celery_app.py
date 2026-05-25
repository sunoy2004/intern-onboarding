from celery import Celery
from config import get_settings

settings = get_settings()

celery_app = Celery(
    "onboarding_tasks",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    beat_schedule={
        "send-training-reminders": {
            "task": "tasks.celery_tasks.send_training_reminders",
            "schedule": 86400.0,  # daily
        },
        "check-stalled-onboardings": {
            "task": "tasks.celery_tasks.check_stalled_onboardings",
            "schedule": 21600.0,  # every 6 hours
        },
    },
)

import asyncio
import json
import logging
import os
import time
import uuid
import redis.asyncio as aioredis

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

class RedisEventBus:
    def __init__(self, redis_url: str = REDIS_URL):
        self.redis_url = redis_url
        self.redis = None

    async def connect(self):
        if not self.redis:
            self.redis = await aioredis.from_url(self.redis_url, decode_responses=True)
            logger.info("Connected to Redis Event Bus")

    async def disconnect(self):
        if self.redis:
            await self.redis.close()
            self.redis = None

    async def publish_event(self, event_type: str, payload: dict, max_retries: int = 3):
        await self.connect()
        event_id = str(uuid.uuid4())
        event = {
            "event_id": event_id,
            "event_type": event_type,
            "timestamp": time.time(),
            "payload": payload,
            "retries": 0,
            "max_retries": max_retries
        }
        event_str = json.dumps(event)
        # Push to general event stream list
        await self.redis.lpush("onboarding_events", event_str)
        # Also publish via PubSub for real-time monitoring dashboard
        await self.redis.publish("monitoring_channel", event_str)
        logger.info(f"Published event {event_type} [ID: {event_id}]")

    async def push_to_dlq(self, event: dict, error_message: str):
        await self.connect()
        event["error"] = error_message
        event["failed_at"] = time.time()
        await self.redis.lpush("onboarding_dlq", json.dumps(event))
        logger.error(f"Event {event.get('event_type')} [ID: {event.get('event_id')}] moved to DLQ: {error_message}")

    async def retry_event(self, event: dict, delay: int = 5):
        await self.connect()
        event["retries"] += 1
        if event["retries"] > event.get("max_retries", 3):
            await self.push_to_dlq(event, f"Max retries ({event.get('max_retries')}) reached.")
            return

        logger.info(f"Scheduling retry {event['retries']} for event {event['event_type']} in {delay}s")
        # Asynchronously wait and push back to main queue
        async def _delayed_retry():
            await asyncio.sleep(delay)
            await self.redis.lpush("onboarding_events", json.dumps(event))
        asyncio.create_task(_delayed_retry())

    async def listen_events(self, handler_callback):
        await self.connect()
        logger.info("Started listening for events on 'onboarding_events' queue...")
        while True:
            try:
                # BRPOP returns (key, value)
                result = await self.redis.brpop("onboarding_events", timeout=2)
                if result:
                    _, event_str = result
                    event = json.loads(event_str)
                    logger.info(f"Received event {event['event_type']} [ID: {event['event_id']}]")
                    try:
                        await handler_callback(event)
                    except Exception as e:
                        logger.error(f"Error handling event {event['event_type']}: {e}", exc_info=True)
                        await self.retry_event(event)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Event bus listener error: {e}")
                await asyncio.sleep(2)

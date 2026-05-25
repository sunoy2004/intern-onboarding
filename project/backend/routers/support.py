from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_active_user
from models.user import User

router = APIRouter(prefix="/support", tags=["support"])


@router.post("/ask")
async def ask_support(
    body: dict,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    question = body.get("question", "")
    if not question:
        return {"answer": "Please provide a question.", "sources": []}

    try:
        from agents.support_agent import SupportAgent
        agent = SupportAgent()
        result = await agent.answer(question, current_user.role.value, db)
        return result
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Support agent error: {e}")
        return {
            "answer": "I'm sorry, I couldn't process your question at this time. Please try again later.",
            "sources": [],
        }

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from services.llm_service import LLMService
from services.rag_service import RAGService

logger = logging.getLogger(__name__)


class SupportAgent:
    async def answer(self, question: str, user_role: str, db: AsyncSession) -> dict:
        # Query RAG service for relevant chunks
        rag = RAGService()
        rag_result = await rag.query(question, role=user_role, n_results=5)
        chunks = rag_result.get("chunks", [])

        if not chunks:
            return {
                "answer": "I don't have specific information about that topic in our knowledge base. Please contact HR for assistance.",
                "sources": [],
            }

        # Build context from chunks
        context = "\n\n".join(
            f"[Source: {c['source']}, Page {c['page']}]\n{c['text']}"
            for c in chunks
        )

        system = (
            f"You are an HR support assistant. Answer only from the provided context. "
            f"The user has role: {user_role}. If the question is about restricted content "
            f"(executive salaries, disciplinary records, other employees' PII), "
            f"respond with 'This information is restricted for your access level.' "
            f"Be helpful, concise, and professional."
        )

        user_prompt = f"Context:\n{context}\n\nQuestion: {question}"

        llm = LLMService()
        answer = await llm.generate(user_prompt, system=system, use_local=True)

        sources = [{"filename": c["source"], "page": c["page"]} for c in chunks]

        return {"answer": answer, "sources": sources}

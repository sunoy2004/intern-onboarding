import json
import logging

from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class LLMService:
    """Routes LLM calls based on sensitivity and availability.
    - use_local=True: always uses Ollama (for HR policy data, PII content)
    - Default: tries Groq first, falls back to Gemini on any exception
    """

    def __init__(self):
        self._groq = None
        self._gemini = None
        self._ollama = None

    def _get_groq(self):
        if self._groq is None and settings.GROQ_API_KEY and settings.GROQ_API_KEY != "placeholder":
            try:
                from langchain_groq import ChatGroq
                self._groq = ChatGroq(
                    model="llama3-70b-8192",
                    api_key=settings.GROQ_API_KEY,
                    temperature=0.3,
                )
            except Exception as e:
                logger.warning(f"Failed to initialize Groq: {e}")
        return self._groq

    def _get_gemini(self):
        if self._gemini is None and settings.GOOGLE_API_KEY and settings.GOOGLE_API_KEY != "placeholder":
            try:
                from langchain_google_genai import ChatGoogleGenerativeAI
                self._gemini = ChatGoogleGenerativeAI(
                    model="gemini-1.5-flash",
                    google_api_key=settings.GOOGLE_API_KEY,
                    temperature=0.3,
                )
            except Exception as e:
                logger.warning(f"Failed to initialize Gemini: {e}")
        return self._gemini

    def _get_ollama(self):
        if self._ollama is None:
            try:
                from langchain_community.llms import Ollama
                self._ollama = Ollama(
                    model="mistral:7b",
                    base_url=settings.OLLAMA_BASE_URL,
                    temperature=0.3,
                )
            except Exception as e:
                logger.warning(f"Failed to initialize Ollama: {e}")
        return self._ollama

    async def generate(self, prompt: str, system: str = "", use_local: bool = False) -> str:
        if use_local:
            ollama = self._get_ollama()
            if ollama:
                try:
                    messages = []
                    if system:
                        messages.append(("system", system))
                    messages.append(("human", prompt))
                    from langchain_core.messages import HumanMessage, SystemMessage
                    lc_msgs = []
                    if system:
                        lc_msgs.append(SystemMessage(content=system))
                    lc_msgs.append(HumanMessage(content=prompt))
                    result = await ollama.ainvoke(lc_msgs)
                    logger.info("LLM used: Ollama (local)")
                    return result.content if hasattr(result, 'content') else str(result)
                except Exception as e:
                    logger.error(f"Ollama failed: {e}")
                    return f"Error: Local LLM unavailable. {e}"

        groq = self._get_groq()
        if groq:
            try:
                from langchain_core.messages import HumanMessage, SystemMessage
                lc_msgs = []
                if system:
                    lc_msgs.append(SystemMessage(content=system))
                lc_msgs.append(HumanMessage(content=prompt))
                result = await groq.ainvoke(lc_msgs)
                logger.info("LLM used: Groq")
                return result.content if hasattr(result, 'content') else str(result)
            except Exception as e:
                logger.warning(f"Groq failed, falling back to Gemini: {e}")

        gemini = self._get_gemini()
        if gemini:
            try:
                from langchain_core.messages import HumanMessage, SystemMessage
                lc_msgs = []
                if system:
                    lc_msgs.append(SystemMessage(content=system))
                lc_msgs.append(HumanMessage(content=prompt))
                result = await gemini.ainvoke(lc_msgs)
                logger.info("LLM used: Gemini (fallback)")
                return result.content if hasattr(result, 'content') else str(result)
            except Exception as e:
                logger.error(f"Gemini failed: {e}")

        ollama = self._get_ollama()
        if ollama:
            try:
                from langchain_core.messages import HumanMessage, SystemMessage
                lc_msgs = []
                if system:
                    lc_msgs.append(SystemMessage(content=system))
                lc_msgs.append(HumanMessage(content=prompt))
                result = await ollama.ainvoke(lc_msgs)
                logger.info("LLM used: Ollama (final fallback)")
                return result.content if hasattr(result, 'content') else str(result)
            except Exception as e:
                logger.error(f"All LLMs failed. Ollama: {e}")

        return "Error: No LLM available. Please configure at least one LLM provider."

    async def generate_structured(self, prompt: str, output_schema: dict, system: str = "", use_local: bool = False) -> dict:
        schema_str = json.dumps(output_schema, indent=2)
        full_prompt = (
            f"{prompt}\n\n"
            f"You MUST respond with valid JSON matching this schema:\n{schema_str}\n"
            f"Respond ONLY with the JSON object, no other text."
        )
        response = await self.generate(full_prompt, system=system, use_local=use_local)

        try:
            if "```json" in response:
                json_str = response.split("```json")[1].split("```")[0].strip()
            elif "```" in response:
                json_str = response.split("```")[1].split("```")[0].strip()
            else:
                json_str = response.strip()
            return json.loads(json_str)
        except (json.JSONDecodeError, IndexError):
            logger.warning("Failed to parse structured LLM response as JSON")
            return {"raw_response": response, "parse_error": True}

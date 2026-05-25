import os
from datetime import datetime, timezone
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings

settings = get_settings()

DEFAULT_CORS_ORIGINS = [
    settings.FRONTEND_URL,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]


def get_cors_origins() -> list[str]:
    configured = os.getenv("CORS_ALLOWED_ORIGINS")
    if not configured:
        return list(dict.fromkeys(DEFAULT_CORS_ORIGINS))
    return [origin.strip() for origin in configured.split(",") if origin.strip()]


def get_cors_origin_regex() -> str | None:
    configured = os.getenv("CORS_ALLOW_ORIGIN_REGEX")
    if configured is not None:
        return configured or None
    return r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    os.makedirs(settings.KNOWLEDGE_BASE_DIR, exist_ok=True)
    os.makedirs(settings.CHROMA_PERSIST_DIR, exist_ok=True)

    try:
        from services.rag_service import RAGService
        rag = RAGService()
        result = await rag.ingest_all_pdfs(settings.KNOWLEDGE_BASE_DIR)
        if result["ingested"] > 0:
            print(f"Ingested {result['ingested']} chunks from {len(result['files'])} PDFs")
    except Exception as e:
        print(f"RAG initialization warning: {e}")

    yield


app = FastAPI(
    title="AI Onboarding System",
    description="Multi-agent AI-powered employee onboarding platform with HITL approval system",
    version="1.0.0",
    lifespan=lifespan,
)

from routers import auth, candidate, hr, it, manager, admin, hitl, support, onboarding

app.include_router(auth.router)
app.include_router(candidate.router)
app.include_router(hr.router)
app.include_router(it.router)
app.include_router(manager.router)
app.include_router(admin.router)
app.include_router(hitl.router)
app.include_router(support.router)
app.include_router(onboarding.router)


@app.get("/health")
async def health_check():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


# Keep CORS as the outermost ASGI layer so error responses also carry CORS headers.
app = CORSMiddleware(
    app,
    allow_origins=get_cors_origins(),
    allow_origin_regex=get_cors_origin_regex(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

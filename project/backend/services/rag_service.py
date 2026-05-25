import logging
import os

from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class RAGService:
    """ChromaDB-based RAG service for knowledge base ingestion and retrieval."""

    def __init__(self):
        self._client = None
        self._collection = None

    def _get_client(self):
        if self._client is None:
            try:
                import chromadb
                self._client = chromadb.PersistentClient(path=settings.CHROMA_PERSIST_DIR)
                self._collection = self._client.get_or_create_collection(
                    name="company_knowledge_base",
                    metadata={"hnsw:space": "cosine"},
                )
                logger.info(f"ChromaDB initialized with {self._collection.count()} documents")
            except Exception as e:
                logger.error(f"Failed to initialize ChromaDB: {e}")
        return self._client

    def _get_collection(self):
        self._get_client()
        return self._collection

    async def ingest_pdf(self, pdf_path: str) -> int:
        try:
            from PyPDF2 import PdfReader
            reader = PdfReader(pdf_path)
            chunks = []
            chunk_size = 500
            overlap = 50

            for page_num, page in enumerate(reader.pages):
                text = page.extract_text()
                if not text:
                    continue
                words = text.split()
                for i in range(0, len(words), chunk_size - overlap):
                    chunk_text = " ".join(words[i:i + chunk_size])
                    if chunk_text.strip():
                        chunks.append({
                            "text": chunk_text,
                            "source": os.path.basename(pdf_path),
                            "page": page_num + 1,
                        })

            if not chunks:
                return 0

            collection = self._get_collection()
            if collection is None:
                return 0

            ids = [f"{os.path.basename(pdf_path)}_chunk_{i}" for i in range(len(chunks))]
            documents = [c["text"] for c in chunks]
            metadatas = [{"source": c["source"], "page": c["page"]} for c in chunks]

            collection.upsert(
                ids=ids,
                documents=documents,
                metadatas=metadatas,
            )
            logger.info(f"Ingested {len(chunks)} chunks from {pdf_path}")
            return len(chunks)
        except Exception as e:
            logger.error(f"Failed to ingest PDF {pdf_path}: {e}")
            return 0

    async def query(self, question: str, role: str = "candidate", n_results: int = 5) -> dict:
        collection = self._get_collection()
        if collection is None or collection.count() == 0:
            return {"chunks": [], "role_filtered": False}

        try:
            results = collection.query(
                query_texts=[question],
                n_results=n_results,
            )

            chunks = []
            for i, doc in enumerate(results["documents"][0]):
                meta = results["metadatas"][0][i] if results["metadatas"] else {}
                source = meta.get("source", "unknown")
                page = meta.get("page", 0)
                chunks.append({"text": doc, "source": source, "page": page})

            role_filtered = False
            if role not in ("hr", "admin"):
                restricted_keywords = ["salary", "compensation", "disciplinary", "termination", "confidential"]
                filtered = []
                for c in chunks:
                    text_lower = c["text"].lower()
                    if not any(kw in text_lower for kw in restricted_keywords):
                        filtered.append(c)
                    else:
                        role_filtered = True
                chunks = filtered

            return {"chunks": chunks, "role_filtered": role_filtered}
        except Exception as e:
            logger.error(f"RAG query failed: {e}")
            return {"chunks": [], "role_filtered": False}

    async def ingest_all_pdfs(self, directory: str) -> dict:
        if not os.path.exists(directory):
            os.makedirs(directory, exist_ok=True)
            return {"ingested": 0, "files": []}

        pdf_files = [f for f in os.listdir(directory) if f.lower().endswith(".pdf")]
        ingested = 0
        files = []

        for pdf_file in pdf_files:
            pdf_path = os.path.join(directory, pdf_file)
            count = await self.ingest_pdf(pdf_path)
            if count > 0:
                ingested += count
                files.append(pdf_file)

        return {"ingested": ingested, "files": files}

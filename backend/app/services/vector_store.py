"""
Vector Store Service — ChromaDB PersistentClient for embedding storage + similarity search.

Module-level singleton: vector_store = VectorStoreService()
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import chromadb

from app.core.config import settings
from app.utils.embedding import get_embedding

logger = logging.getLogger(__name__)


class VectorStoreService:
    """ChromaDB PersistentClient wrapper — one collection per deployment."""

    def __init__(self) -> None:
        self._client = chromadb.PersistentClient(
            path=settings.CHROMA_PERSIST_DIR,
        )
        self._collection = self._client.get_or_create_collection(
            name="eduraq_chunks",
        )
        logger.info(
            "VectorStoreService initialized (dir=%s, dim=%d)",
            settings.CHROMA_PERSIST_DIR,
            settings.EMBEDDING_DIM,
        )

    # ── Public API ──────────────────────────────────────

    async def add_chunks(self, chunks: list[dict]) -> None:
        """Embed chunk contents and store in ChromaDB.

        Each dict must contain: chunk_id, document_id, content, metadata.
        ``metadata`` (dict | None) is merged into the ChromaDB metadata alongside
        ``document_id``.
        """
        if not chunks:
            return

        texts = [c["content"] for c in chunks]
        ids = [str(c["chunk_id"]) for c in chunks]

        # Build flat, ChromaDB-compatible metadata
        metadatas: list[dict[str, Any]] = []
        for c in chunks:
            meta: dict[str, Any] = {"document_id": c["document_id"]}
            extra = c.get("metadata")
            if isinstance(extra, dict):
                meta.update(extra)
            metadatas.append(meta)

        emb = get_embedding()
        vectors = await asyncio.to_thread(emb.embed_documents, texts)

        self._collection.add(
            ids=ids,
            embeddings=vectors,
            documents=texts,
            metadatas=metadatas,
        )
        logger.debug("Added %d chunks to vector store", len(chunks))

    async def search(
        self,
        query: str,
        top_k: int = 10,
        where_filter: dict | None = None,
    ) -> list[dict]:
        """Embed *query* and return top-k similar chunks.

        Returns a list of dicts with keys:
        ``chunk_id``, ``document_id``, ``content``, ``score``, ``metadata``.
        """
        emb = get_embedding()
        query_vec = await asyncio.to_thread(emb.embed_query, query)

        results = self._collection.query(
            query_embeddings=[query_vec],
            n_results=top_k,
            where=where_filter,
            include=["documents", "metadatas", "distances"],
        )

        output: list[dict] = []
        ids_batch = results.get("ids", [[]])[0]
        if not ids_batch:
            return output

        docs_batch = results.get("documents", [[]])[0]
        metas_batch = results.get("metadatas", [[]])[0]
        dists_batch = results.get("distances", [[]])[0]

        for i in range(len(ids_batch)):
            meta = metas_batch[i] if i < len(metas_batch) else {}
            content = docs_batch[i] if i < len(docs_batch) else ""
            # ChromaDB default distance is cosine → 1 − distance = cosine similarity
            distance = dists_batch[i] if i < len(dists_batch) else 0.0
            score = 1.0 - distance

            output.append({
                "chunk_id": int(ids_batch[i]),
                "document_id": meta.get("document_id", 0),
                "content": content,
                "score": round(score, 6),
                "metadata": meta,
            })

        return output

    async def delete_by_document(self, document_id: int) -> int:
        """Delete all chunks belonging to *document_id*. Returns count of deleted chunks."""
        existing = self._collection.get(where={"document_id": document_id})
        count = len(existing["ids"]) if existing and existing.get("ids") else 0

        if count > 0:
            self._collection.delete(where={"document_id": document_id})
            logger.info("Deleted %d chunks for document_id=%d", count, document_id)

        return count

    async def health_check(self) -> bool:
        """Return True if the ChromaDB collection is reachable."""
        try:
            self._client.get_collection("eduraq_chunks")
            return True
        except Exception as exc:
            logger.warning("Vector store health check failed: %s", exc)
            return False


# ── Module-level singleton ──────────────────────────────

vector_store = VectorStoreService()

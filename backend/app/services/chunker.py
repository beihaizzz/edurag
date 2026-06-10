"""Text chunking service for RAG — splits documents into overlapping segments."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any

from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.core.config import settings

logger = logging.getLogger(__name__)

# Chinese-aware separators: prefer natural sentence/paragraph breaks
_CHINESE_SEPARATORS: list[str] = [
    "\n\n",
    "\n",
    "。",
    "！",
    "？",
    "；",
    ".",
    "!",
    "?",
    ";",
    " ",
    "",
]


@dataclass
class ChunkData:
    """A single text chunk produced by the splitter.

    Attributes:
        content: The chunk text.
        index: Zero-based position in the chunk list.
        char_count: Number of characters in the chunk.
        metadata: Arbitrary metadata propagated from the source document.
    """

    content: str
    index: int
    char_count: int
    metadata: dict[str, Any] = field(default_factory=dict)


async def chunk_text(
    text: str,
    metadata: dict[str, Any] | None = None,
) -> list[ChunkData]:
    """Split raw text into overlapping chunks suitable for RAG ingestion.

    Args:
        text: Raw text to split.
        metadata: Key-value pairs propagated to every resulting chunk.

    Returns:
        List of ChunkData (empty list if text is empty/whitespace).
    """
    if metadata is None:
        metadata = {}

    if not text or not text.strip():
        logger.warning("chunk_text called with empty text")
        return []

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=settings.RAG_CHUNK_SIZE,
        chunk_overlap=settings.RAG_CHUNK_OVERLAP,
        separators=_CHINESE_SEPARATORS,
        length_function=len,
        is_separator_regex=False,
    )

    # split_text is CPU-bound; push to thread to avoid blocking the event loop
    raw_chunks = await asyncio.to_thread(splitter.split_text, text)

    chunks: list[ChunkData] = []
    for idx, raw in enumerate(raw_chunks):
        chunk = ChunkData(
            content=raw,
            index=idx,
            char_count=len(raw),
            metadata=dict(metadata),  # shallow copy so mutations don't bleed
        )
        chunks.append(chunk)

    logger.debug(
        "chunk_text: %d chars → %d chunks (size=%d, overlap=%d)",
        len(text),
        len(chunks),
        settings.RAG_CHUNK_SIZE,
        settings.RAG_CHUNK_OVERLAP,
    )

    return chunks

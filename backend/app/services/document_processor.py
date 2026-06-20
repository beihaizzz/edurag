"""Document processing pipeline service — parse → chunk → save → vectorize."""

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Chunk, Document
from app.services.chunker import chunk_text
from app.services.document_parser import parse_document
from app.services.vector_store import vector_store

logger = logging.getLogger(__name__)


async def run_document_pipeline(db: AsyncSession, document_id: int) -> dict:
    """Execute the full document processing pipeline.

    Steps: parse → chunk → save → vectorize.

    Args:
        db: Active AsyncSession (provided by caller).
        document_id: ID of the Document to process.

    Returns:
        dict with keys: success (bool), message (str), chunk_count (int).
    """
    try:
        doc = await db.scalar(
            select(Document).where(Document.id == document_id)
        )
        if doc is None:
            return {"success": False, "message": "文档不存在", "chunk_count": 0}

        # Mark as processing
        doc.processing_status = "processing"
        await db.commit()

        # 1. Parse
        parsed = await parse_document(doc.file_path)
        if parsed.error:
            doc.processing_status = "failed"
            await db.commit()
            return {"success": False, "message": f"解析失败: {parsed.error}", "chunk_count": 0}

        # 2. Chunk
        chunks = await chunk_text(parsed.text, metadata={
            "document_id": doc.id,
            "title": doc.title,
        })
        if not chunks:
            doc.processing_status = "failed"
            await db.commit()
            return {"success": False, "message": "文档无有效文本内容", "chunk_count": 0}

        # 3. Save Chunk records to DB
        chunk_records = []
        for c in chunks:
            cr = Chunk(
                document_id=doc.id,
                chunk_index=c.index,
                content=c.content,
                char_count=c.char_count,
            )
            db.add(cr)
            chunk_records.append(cr)
        await db.flush()

        # 4. Vectorize (non-fatal on failure)
        try:
            vec_chunks = [
                {
                    "chunk_id": cr.id,
                    "document_id": doc.id,
                    "content": cr.content,
                    "metadata": {"title": doc.title, "course_id": doc.course_id},
                }
                for cr in chunk_records
            ]
            await vector_store.add_chunks(vec_chunks)
        except Exception as e:
            logger.warning("Vector store unavailable, skipping: %s", e)

        doc.processing_status = "completed"
        await db.commit()

        return {
            "success": True,
            "message": f"处理完成，共 {len(chunks)} 个片段",
            "chunk_count": len(chunks),
        }
    except Exception:
        logger.exception("Document processing failed for doc %d", document_id)
        # Best-effort status update
        try:
            doc = await db.scalar(
                select(Document).where(Document.id == document_id)
            )
            if doc:
                doc.processing_status = "failed"
                await db.commit()
        except Exception:
            logger.exception("Failed to update processing_status for doc %d", document_id)
        return {"success": False, "message": "处理失败，请查看日志", "chunk_count": 0}


async def _run_pipeline_background(document_id: int) -> None:
    """Background task wrapper — creates its own DB session.

    For use with FastAPI ``BackgroundTasks``. Fire-and-forget with error logging.
    """
    from app.core.database import AsyncSessionLocal

    try:
        async with AsyncSessionLocal() as db:
            await run_document_pipeline(db, document_id)
    except Exception:
        logger.exception("Background pipeline failed for doc %d", document_id)

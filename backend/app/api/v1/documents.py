"""文档管理 API 路由 — 上传 / 列表 / 详情 / 更新 / 删除 / 审核"""

import hashlib
import json
import logging
import math
import os

import aiofiles
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.config import settings
from app.core.database import get_db
from app.deps import get_current_user, require_role
from app.models import Chunk, Document, User
from app.schemas.common import APIResponse, PaginatedData
from app.schemas.document import (
    ChunkPreview,
    DocumentApprove,
    DocumentDetail,
    DocumentItem,
    DocumentUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="", tags=["documents"])

ALLOWED_EXTENSIONS = set(
    ext.strip().lower().lstrip(".") for ext in settings.ALLOWED_EXTENSIONS.split(",")
)


# ── helpers ──────────────────────────────────────────────────────────


def _check_permission(user: User, doc: Document) -> None:
    """确保操作者是上传者或管理员"""
    if user.role != "admin" and user.id != doc.uploader_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只能操作自己上传的文档",
        )


def _compute_sha256(file_path: str) -> str:
    """计算文件 SHA-256 摘要"""
    sha = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            sha.update(chunk)
    return sha.hexdigest()


def _delete_chroma_vectors(document_id: int) -> None:
    """从 ChromaDB 删除指定文档的全部向量"""
    try:
        import chromadb

        client = chromadb.PersistentClient(path=settings.CHROMA_PERSIST_DIR)
        collection = client.get_or_create_collection(name="eduraq_chunks")
        collection.delete(where={"document_id": document_id})
        logger.info("Deleted ChromaDB vectors for document %d", document_id)
    except Exception:
        logger.exception("Failed to delete ChromaDB vectors for document %d", document_id)


# ── POST /documents ──────────────────────────────────────────────────


@router.post("/documents", status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    title: str = Form(..., min_length=1, max_length=512),
    file_type: str = Form(default="other"),
    course_id: int | None = Form(None),
    description: str = Form(""),
    tags: str = Form("[]"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """上传文档（multipart/form-data）

    tags 字段为 JSON 字符串，如 '["栈","队列"]'
    """
    # ── 校验文件扩展名 ──
    ext = os.path.splitext(file.filename or "")[1].lstrip(".").lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"不支持的文件类型 .{ext}，允许: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    # ── 校验文件大小（读取内容，限制在 settings.MAX_UPLOAD_SIZE_MB 内）──
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    content = await file.read()
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"文件大小不能超过 {settings.MAX_UPLOAD_SIZE_MB} MB",
        )

    # ── 解析 tags ──
    try:
        tag_list: list[str] = json.loads(tags)
        if not isinstance(tag_list, list):
            raise ValueError
    except (json.JSONDecodeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="tags 字段必须是 JSON 字符串数组",
        )

    # ── 写入磁盘 ──
    user_dir = os.path.join(settings.UPLOAD_DIR, str(user.id))
    os.makedirs(user_dir, exist_ok=True)

    safe_filename = _safe_filename(file.filename or "untitled")
    dest_path = os.path.join(user_dir, safe_filename)

    async with aiofiles.open(dest_path, "wb") as f:
        await f.write(content)

    # ── 计算 SHA-256 ──
    try:
        file_hash = _compute_sha256(dest_path)
    except OSError:
        file_hash = None

    # ── 写入数据库 ──
    doc = Document(
        course_id=course_id,
        uploader_id=user.id,
        filename=safe_filename,
        file_type=file_type,
        title=title,
        description=description,
        tags=tag_list,
        file_path=dest_path,
        file_size=len(content),
        file_hash=file_hash,
        status="pending",
        processing_status="pending",
    )
    db.add(doc)
    await db.flush()
    await db.commit()
    await db.refresh(doc)

    # 重新加载关联（course / uploader）
    doc = await db.scalar(
        select(Document)
        .options(joinedload(Document.course), joinedload(Document.uploader))
        .where(Document.id == doc.id)
    )

    return APIResponse(
        message="上传成功",
        data=DocumentDetail.model_validate(doc).model_dump(mode="json"),
    )


# ── GET /documents ───────────────────────────────────────────────────


@router.get("/documents")
async def list_documents(
    course_id: int | None = Query(None),
    file_type: str | None = Query(None),
    status: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """文档列表（分页 + 筛选）。教师只看自己上传的，管理员看全部。"""
    conditions = []

    # 教师只能看自己的文档
    if user.role == "teacher":
        conditions.append(Document.uploader_id == user.id)

    if course_id is not None:
        conditions.append(Document.course_id == course_id)
    if file_type is not None:
        conditions.append(Document.file_type == file_type)
    if status is not None:
        conditions.append(Document.status == status)

    # 总数
    count_q = select(func.count()).select_from(Document)
    if conditions:
        count_q = count_q.where(*conditions)
    total = (await db.execute(count_q)).scalar() or 0

    total_pages = max(1, math.ceil(total / page_size))

    # 列表
    list_q = (
        select(Document)
        .options(joinedload(Document.course), joinedload(Document.uploader))
        .order_by(Document.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    if conditions:
        list_q = list_q.where(*conditions)

    rows = (await db.execute(list_q)).unique().scalars().all()

    items = [DocumentItem.model_validate(doc).model_dump(mode="json") for doc in rows]

    return APIResponse(
        data=PaginatedData(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        ).model_dump(mode="json")
    )


# ── GET /documents/statistics ────────────────────────────────────────


@router.get("/documents/statistics")
async def get_document_statistics(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """文档统计（教师看自己的，admin 看全部）"""
    base = select(func.count()).select_from(Document)
    if user.role == "teacher":
        base = base.where(Document.uploader_id == user.id)

    total = (await db.execute(base)).scalar() or 0
    pending = (await db.execute(base.where(Document.status == "pending"))).scalar() or 0
    approved = (await db.execute(base.where(Document.status == "approved"))).scalar() or 0
    rejected = (await db.execute(base.where(Document.status == "rejected"))).scalar() or 0

    return APIResponse(data={
        "total": total,
        "pending": pending,
        "approved": approved,
        "rejected": rejected,
    })


# ── GET /documents/{id}/file ─────────────────────────────────────────


@router.get("/documents/{document_id}/file")
async def download_document_file(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """下载/预览文档原始文件"""
    doc = await db.scalar(select(Document).where(Document.id == document_id))
    if doc is None:
        raise HTTPException(status_code=404, detail="文档不存在")
    if not os.path.isfile(doc.file_path):
        raise HTTPException(status_code=404, detail="文件不存在")
    return FileResponse(doc.file_path, filename=doc.filename)


# ── GET /documents/{id} ──────────────────────────────────────────────


@router.get("/documents/{document_id}")
async def get_document_detail(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """文档详情（含前 5 个 chunk 预览）"""
    doc = await db.scalar(
        select(Document)
        .options(joinedload(Document.course), joinedload(Document.uploader))
        .where(Document.id == document_id)
    )
    if doc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="文档不存在",
        )

    # 前 5 个 chunk，每个截断到 200 字符
    chunks = (
        (
            await db.execute(
                select(Chunk)
                .where(Chunk.document_id == document_id)
                .order_by(Chunk.chunk_index)
                .limit(5)
            )
        )
        .scalars()
        .all()
    )

    chunks_preview = [
        ChunkPreview(
            chunk_index=chunk.chunk_index,
            content=chunk.content[:200],
            char_count=chunk.char_count,
        )
        for chunk in chunks
    ]

    detail = DocumentDetail.model_validate(doc)
    detail.chunks_preview = chunks_preview

    return APIResponse(
        data=detail.model_dump(mode="json"),
    )


# ── PUT /documents/{id} ──────────────────────────────────────────────


@router.put("/documents/{document_id}")
async def update_document(
    document_id: int,
    body: DocumentUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """更新文档元数据（上传者或管理员）"""
    doc = await db.scalar(
        select(Document)
        .options(joinedload(Document.course), joinedload(Document.uploader))
        .where(Document.id == document_id)
    )
    if doc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="文档不存在",
        )

    _check_permission(user, doc)

    # 部分更新
    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(doc, field, value)

    await db.commit()
    await db.refresh(doc)

    return APIResponse(
        message="更新成功",
        data=DocumentDetail.model_validate(doc).model_dump(mode="json"),
    )


# ── DELETE /documents/{id} ───────────────────────────────────────────


@router.delete("/documents/{document_id}")
async def delete_document(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """删除文档（文件 + 数据库 + ChromaDB 向量）

    仅上传者或管理员可操作。
    """
    doc = await db.scalar(
        select(Document)
        .options(joinedload(Document.course), joinedload(Document.uploader))
        .where(Document.id == document_id)
    )
    if doc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="文档不存在",
        )

    _check_permission(user, doc)

    # 删除 ChromaDB 向量
    _delete_chroma_vectors(document_id)

    # 删除磁盘文件
    try:
        if os.path.isfile(doc.file_path):
            os.remove(doc.file_path)
    except OSError:
        logger.exception("Failed to delete file %s", doc.file_path)

    # 删除数据库记录（cascade 自动删除 chunks）
    await db.delete(doc)
    await db.commit()

    return APIResponse(message="删除成功")


# ── POST /documents/{id}/approve ─────────────────────────────────────


@router.post("/documents/{document_id}/approve")
async def approve_document(
    document_id: int,
    body: DocumentApprove,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin")),
):
    """审核文档（仅管理员）"""
    doc = await db.scalar(
        select(Document)
        .options(joinedload(Document.course), joinedload(Document.uploader))
        .where(Document.id == document_id)
    )
    if doc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="文档不存在",
        )

    doc.status = body.status
    doc.audit_comment = body.comment
    doc.auditor_id = user.id

    await db.commit()
    await db.refresh(doc)

    return APIResponse(
        message="审核完成",
        data=DocumentDetail.model_validate(doc).model_dump(mode="json"),
    )


# ── POST /documents/{id}/process ──────────────────────────────────────


@router.post("/documents/{document_id}/process")
async def process_document(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("teacher", "admin")),
):
    """触发文档处理管线：解析 → 切分 → 向量化"""
    doc = await db.scalar(
        select(Document).where(Document.id == document_id)
    )
    if doc is None:
        raise HTTPException(status_code=404, detail="文档不存在")
    if doc.uploader_id != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="只能处理自己上传的文档")

    try:
        # Mark as processing
        doc.processing_status = "processing"
        await db.commit()

        # 1. Parse
        from app.services.document_parser import parse_document
        parsed = await parse_document(doc.file_path)
        if parsed.error:
            doc.processing_status = "failed"
            await db.commit()
            return APIResponse(code=50001, message=f"解析失败: {parsed.error}")

        # 2. Chunk
        from app.services.chunker import chunk_text
        chunks = await chunk_text(parsed.text, metadata={
            "document_id": doc.id,
            "title": doc.title,
        })
        if not chunks:
            doc.processing_status = "failed"
            await db.commit()
            return APIResponse(code=50001, message="文档无有效文本内容")

        # 3. Save Chunk records to DB
        from app.models import Chunk
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

        # 4. Vectorize
        try:
            from app.services.vector_store import vector_store
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

        return APIResponse(
            message=f"处理完成，共 {len(chunks)} 个片段",
            data={"chunk_count": len(chunks)},
        )
    except Exception:
        logger.exception("Document processing failed for doc %d", document_id)
        doc.processing_status = "failed"
        await db.commit()
        return APIResponse(code=50001, message="处理失败，请查看日志")


# ── helper ─────────────────────────────────────────────────────────

def _safe_filename(raw: str) -> str:
    """生成安全的存储文件名（保留扩展名，去除非安全字符）"""
    name, ext = os.path.splitext(raw)
    safe = "".join(c for c in name if c.isalnum() or c in "._- ()（）")
    safe = safe.strip() or "untitled"
    return safe + ext.lower()

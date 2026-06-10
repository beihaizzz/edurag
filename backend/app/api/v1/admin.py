"""管理后台 API 路由 — 仪表盘 / 用户管理 / 文档审核 / 审计日志"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel  # noqa: F811
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import hash_password
from app.deps import require_role
from app.models import AuditLog, Course, Document, QAHistory, User
from app.schemas.common import APIResponse, PaginatedData

router = APIRouter(prefix="", tags=["admin"])


# ═══════════════════════════════════════════════════════════════════════
# GET /admin/dashboard
# ═══════════════════════════════════════════════════════════════════════


@router.get("/admin/dashboard")
async def admin_dashboard(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role("admin")),
):
    """管理后台仪表盘 — 核心统计数据"""
    total_users = await db.scalar(
        select(func.count()).select_from(User).where(User.is_active == True)
    )
    total_courses = await db.scalar(
        select(func.count()).select_from(Course).where(Course.is_deleted == False)
    )
    total_docs = await db.scalar(select(func.count()).select_from(Document))
    pending_docs = await db.scalar(
        select(func.count()).select_from(Document).where(Document.status == "pending")
    )
    total_qa = await db.scalar(select(func.count()).select_from(QAHistory))
    today_qa = await db.scalar(
        select(func.count()).select_from(QAHistory).where(
            func.date(QAHistory.created_at) == func.current_date()
        )
    )

    return APIResponse(
        data={
            "total_users": total_users or 0,
            "total_courses": total_courses or 0,
            "total_docs": total_docs or 0,
            "pending_docs": pending_docs or 0,
            "total_qa": total_qa or 0,
            "today_qa": today_qa or 0,
        }
    )


# ═══════════════════════════════════════════════════════════════════════
# GET /admin/documents
# ═══════════════════════════════════════════════════════════════════════


@router.get("/admin/documents")
async def admin_list_documents(
    status_filter: str | None = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role("admin")),
):
    """管理端文档列表（支持状态筛选）"""
    base = select(Document)
    if status_filter:
        base = base.where(Document.status == status_filter)

    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar() or 0
    total_pages = max(1, (total + page_size - 1) // page_size)

    q = base.order_by(Document.created_at.desc()).offset(
        (page - 1) * page_size
    ).limit(page_size)
    result = await db.execute(q)
    documents = result.scalars().all()

    return APIResponse(
        data=PaginatedData(
            items=[
                {
                    "id": d.id,
                    "title": d.title,
                    "file_type": d.file_type,
                    "filename": d.filename,
                    "status": d.status,
                    "processing_status": d.processing_status,
                    "course_id": d.course_id,
                    "uploader_id": d.uploader_id,
                    "file_size": d.file_size,
                    "created_at": d.created_at.isoformat() if d.created_at else None,
                }
                for d in documents
            ],
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        ).model_dump()
    )


# ═══════════════════════════════════════════════════════════════════════
# GET /admin/users
# ═══════════════════════════════════════════════════════════════════════


@router.get("/admin/users")
async def admin_list_users(
    role: str | None = Query(None),
    is_active: bool | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role("admin")),
):
    """管理端用户列表（支持角色/状态筛选）"""
    base = select(User)
    if role:
        base = base.where(User.role == role)
    if is_active is not None:
        base = base.where(User.is_active == is_active)

    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar() or 0
    total_pages = max(1, (total + page_size - 1) // page_size)

    q = base.order_by(User.id.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    users = result.scalars().all()

    return APIResponse(
        data=PaginatedData(
            items=[
                {
                    "id": u.id,
                    "username": u.username,
                    "role": u.role,
                    "real_name": u.real_name,
                    "email": u.email,
                    "is_active": u.is_active,
                    "force_password_change": u.force_password_change,
                    "created_at": u.created_at.isoformat() if u.created_at else None,
                }
                for u in users
            ],
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        ).model_dump()
    )


# ═══════════════════════════════════════════════════════════════════════
# PUT /admin/users/{id}/disable
# ═══════════════════════════════════════════════════════════════════════


@router.put("/admin/users/{user_id}/disable")
async def admin_disable_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role("admin")),
):
    """切换用户激活状态"""
    target = await db.get(User, user_id)
    if not target:
        return APIResponse(code=40401, message="用户不存在")

    target.is_active = not target.is_active
    await db.commit()

    return APIResponse(
        message=f"用户已{'启用' if target.is_active else '禁用'}",
        data={"user_id": user_id, "is_active": target.is_active},
    )


# ═══════════════════════════════════════════════════════════════════════
# POST /admin/users/{id}/reset-password
# ═══════════════════════════════════════════════════════════════════════


@router.post("/admin/users/{user_id}/reset-password")
async def admin_reset_password(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role("admin")),
):
    """管理员重置用户密码（生成 8 位临时密码）"""
    import secrets

    target = await db.get(User, user_id)
    if not target:
        return APIResponse(code=40401, message="用户不存在")

    temp_password = secrets.token_urlsafe(6)[:8]
    target.password_hash = hash_password(temp_password)
    target.force_password_change = True
    await db.commit()

    return APIResponse(
        message="密码已重置",
        data={"user_id": user_id, "temp_password": temp_password},
    )


# ═══════════════════════════════════════════════════════════════════════
# GET /admin/audit-logs
# ═══════════════════════════════════════════════════════════════════════


@router.get("/admin/audit-logs")
async def admin_list_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role("admin")),
):
    """管理端操作日志列表"""
    try:
        count_q = select(func.count()).select_from(AuditLog)
        total = (await db.execute(count_q)).scalar() or 0
        total_pages = max(1, (total + page_size - 1) // page_size)

        q = (
            select(AuditLog)
            .order_by(AuditLog.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        result = await db.execute(q)
        logs = result.scalars().all()

        return APIResponse(
            data=PaginatedData(
                items=[
                    {
                        "id": l.id,
                        "user_id": l.user_id,
                        "action": l.action,
                        "target_type": l.target_type,
                        "target_id": l.target_id,
                        "details": l.details,
                        "ip_address": l.ip_address,
                        "created_at": l.created_at.isoformat() if l.created_at else None,
                    }
                    for l in logs
                ],
                total=total,
                page=page,
                page_size=page_size,
                total_pages=total_pages,
            ).model_dump()
        )
    except Exception:
        return APIResponse(
            data=PaginatedData(items=[], total=0, page=page, page_size=page_size, total_pages=0).model_dump()
        )

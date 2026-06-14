"""管理后台 API 路由 — 仪表盘 / 用户管理 / 文档审核 / 审计日志"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel  # noqa: F811
from sqlalchemy import Date, Integer, cast, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import hash_password
from app.deps import require_role
from app.models import AuditLog, Course, Document, Feedback, QAHistory, User
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

# ═══════════════════════════════════════════════════════════════════════
# GET /admin/qa/stats
# ═══════════════════════════════════════════════════════════════════════


@router.get("/admin/qa/stats")
async def admin_qa_stats(
    course_id: int | None = Query(None),
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role("admin")),
):
    """教师数据洞察 — 高频问题 Top-N + 知识盲区统计 + QA 趋势 + 反馈汇总"""
    def _course_filter(stmt):
        if course_id:
            return stmt.where(QAHistory.course_id == course_id)
        return stmt

    # ── 1. Summary ──
    total_qa_q = _course_filter(select(func.count()).select_from(QAHistory))
    total_qa = (await db.execute(total_qa_q)).scalar() or 0

    today_qa_q = _course_filter(
        select(func.count()).select_from(QAHistory).where(
            func.date(QAHistory.created_at) == func.current_date()
        )
    )
    today_qa = (await db.execute(today_qa_q)).scalar() or 0

    rejected_q = _course_filter(
        select(func.count()).select_from(QAHistory).where(QAHistory.is_rejected == True)
    )
    rejected_count = (await db.execute(rejected_q)).scalar() or 0
    rejection_rate = round(rejected_count / total_qa, 4) if total_qa else 0

    avg_latency_q = _course_filter(select(func.avg(QAHistory.latency_ms)).select_from(QAHistory))
    avg_latency = (await db.execute(avg_latency_q)).scalar()
    avg_latency_ms = round(avg_latency) if avg_latency else 0

    # ── 2. By Course ──
    qa_by_course_q = _course_filter(
        select(QAHistory.course_id, func.count().label("count"))
        .where(QAHistory.course_id.isnot(None))
        .group_by(QAHistory.course_id)
        .order_by(func.count().desc())
    )
    course_counts = (await db.execute(qa_by_course_q)).all()
    course_ids = [row.course_id for row in course_counts]
    courses_map = {}
    if course_ids:
        courses_result = await db.execute(
            select(Course.id, Course.name).where(Course.id.in_(course_ids))
        )
        for cid, cname in courses_result:
            courses_map[cid] = cname
    qa_by_course = [
        {"course_id": row.course_id, "course_name": courses_map.get(row.course_id, "未知"),
         "count": row.count}
        for row in course_counts
    ]

    # ── 3. Trend (daily) ──
    trend_q = _course_filter(
        select(
            cast(QAHistory.created_at, Date).label("date"),
            func.count().label("count"),
            func.sum(cast(QAHistory.is_rejected, Integer)).label("rejected"),
        )
        .where(QAHistory.created_at >= func.current_date() - func.make_interval(0, 0, 0, days))
        .group_by(cast(QAHistory.created_at, Date))
        .order_by(cast(QAHistory.created_at, Date))
    )
    trend_rows = (await db.execute(trend_q)).all()
    qa_trend = [
        {"date": str(row.date), "count": row.count, "rejected": row.rejected or 0}
        for row in trend_rows
    ]

    # ── 4. High-frequency questions ──
    hf_q = _course_filter(
        select(QAHistory.question, QAHistory.course_id,
               func.count().label("count"),
               func.max(QAHistory.created_at).label("last_asked"))
        .group_by(QAHistory.question, QAHistory.course_id)
        .order_by(func.count().desc())
        .limit(limit)
    )
    hf_rows = (await db.execute(hf_q)).all()
    high_freq_questions = [
        {
            "question": row.question,
            "count": row.count,
            "course_name": courses_map.get(row.course_id, "未知"),
            "last_asked_at": row.last_asked.isoformat() if row.last_asked else None,
        }
        for row in hf_rows
    ]

    # ── 5. Blind spots (rejected questions) ──
    bs_q = _course_filter(
        select(QAHistory.question, QAHistory.course_id,
               func.count().label("count"),
               func.max(QAHistory.created_at).label("last_asked"))
        .where(QAHistory.is_rejected == True)
        .group_by(QAHistory.question, QAHistory.course_id)
        .order_by(func.count().desc())
        .limit(limit)
    )
    bs_rows = (await db.execute(bs_q)).all()
    blind_spots = [
        {
            "question": row.question,
            "count": row.count,
            "course_name": courses_map.get(row.course_id, "未知"),
            "last_asked_at": row.last_asked.isoformat() if row.last_asked else None,
        }
        for row in bs_rows
    ]

    # ── 6. Feedback summary ──
    fb_q = select(Feedback.type, func.count().label("count")).group_by(Feedback.type)
    fb_rows = (await db.execute(fb_q)).all()
    feedback_summary = {"useful": 0, "useless": 0, "error": 0, "total": 0}
    for row in fb_rows:
        if row.type in feedback_summary:
            feedback_summary[row.type] = row.count
    feedback_summary["total"] = sum(v for k, v in feedback_summary.items() if k != "total")

    return APIResponse(
        data={
            "summary": {
                "total_qa": total_qa,
                "today_qa": today_qa,
                "rejected_count": rejected_count,
                "rejection_rate": rejection_rate,
                "avg_latency_ms": avg_latency_ms,
            },
            "qa_by_course": qa_by_course,
            "qa_trend": qa_trend,
            "high_freq_questions": high_freq_questions,
            "blind_spots": blind_spots,
            "feedback_summary": feedback_summary,
        }
    )


# ═══════════════════════════════════════════════════════════════════════
# GET /admin/logs
# ═══════════════════════════════════════════════════════════════════════


@router.get("/admin/logs")
async def admin_list_logs(
    action: str | None = Query(None, description="按操作类型筛选，如 document.approve"),
    user_id: int | None = Query(None, description="按用户 ID 筛选"),
    date_from: str | None = Query(None, alias="date_from", description="起始日期 YYYY-MM-DD"),
    date_to: str | None = Query(None, alias="date_to", description="结束日期 YYYY-MM-DD"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role("admin")),
):
    """系统操作日志列表 — 支持按操作类型/用户/日期范围筛选"""
    from sqlalchemy.orm import aliased
    from app.models import User as UserModel

    # ── Base query ──
    base = select(AuditLog)

    # ── Dynamic WHERE ──
    conditions = []
    if action:
        conditions.append(AuditLog.action == action)
    if user_id:
        conditions.append(AuditLog.user_id == user_id)
    if date_from:
        conditions.append(AuditLog.created_at >= date_from)
    if date_to:
        end_date = date_to
        if "T" not in date_to:
            end_date = date_to + "T23:59:59"
        conditions.append(AuditLog.created_at <= end_date)
    if conditions:
        base = base.where(*conditions)

    # ── Total count ──
    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar() or 0
    total_pages = max(1, (total + page_size - 1) // page_size)

    # ── Paginated query with user join ──
    user_alias = aliased(UserModel)
    q = (
        select(AuditLog, user_alias.username)
        .join(user_alias, AuditLog.user_id == user_alias.id, isouter=True)
    )
    if conditions:
        q = q.where(*conditions)
    q = q.order_by(AuditLog.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    rows = result.all()

    return APIResponse(
        data=PaginatedData(
            items=[
                {
                    "id": row[0].id,
                    "user_id": row[0].user_id,
                    "username": row[1],
                    "action": row[0].action,
                    "detail": row[0].detail,
                    "ip_address": row[0].ip_address,
                    "created_at": row[0].created_at.isoformat() if row[0].created_at else None,
                }
                for row in rows
            ],
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        ).model_dump()
    )

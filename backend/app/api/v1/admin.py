"""管理后台 API 路由 — 仪表盘 / 用户管理 / 文档审核 / 审计日志 / 问答洞察"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel  # noqa: F811
from sqlalchemy import Integer, cast, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import hash_password
from app.deps import require_role
from app.models import AuditLog, Course, Document, Feedback, QAHistory, User
from app.schemas.common import APIResponse, PaginatedData
from app.services.audit import log_action

router = APIRouter(prefix="", tags=["admin"])


# ═══════════════════════════════════════════════════════════════════════
# GET /admin/dashboard
# ═══════════════════════════════════════════════════════════════════════


@router.get("/admin/dashboard")
async def admin_dashboard(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role("admin")),
):
    """管理后台仪表盘 — 核心统计数据

    聚合：
    - 用户规模（总数 + 按角色拆分）
    - 资料总量 + 完整状态分布（pending / approved / rejected）
    - 问答规模（总量 / 今日 / 拒答数）
    - 反馈统计（useful / useless / error / 总量 / 带评论数）
    """
    # ── 用户 ──
    total_users = await db.scalar(
        select(func.count()).select_from(User).where(User.is_active == True)  # noqa: E712
    )
    user_role_rows = (await db.execute(
        select(User.role, func.count(User.id))
        .where(User.is_active == True)  # noqa: E712
        .group_by(User.role)
    )).all()
    user_role_dist = {r: 0 for r in ("student", "teacher", "admin")}
    for role, cnt in user_role_rows:
        user_role_dist[role] = cnt

    # ── 课程 / 文档 ──
    total_courses = await db.scalar(
        select(func.count()).select_from(Course).where(Course.is_deleted == False)  # noqa: E712
    )
    total_docs = await db.scalar(select(func.count()).select_from(Document))

    doc_status_rows = (await db.execute(
        select(Document.status, func.count(Document.id)).group_by(Document.status)
    )).all()
    doc_status_dist = {s: 0 for s in ("pending", "approved", "rejected")}
    for s, cnt in doc_status_rows:
        doc_status_dist[s] = cnt

    # ── 问答 ──
    total_qa = await db.scalar(select(func.count()).select_from(QAHistory))
    today_qa = await db.scalar(
        select(func.count()).select_from(QAHistory).where(
            func.date(QAHistory.created_at) == func.current_date()
        )
    )
    rejected_qa = await db.scalar(
        select(func.count()).select_from(QAHistory).where(QAHistory.is_rejected == True)  # noqa: E712
    )

    # ── 反馈 ──
    feedback_rows = (await db.execute(
        select(Feedback.type, func.count(Feedback.id)).group_by(Feedback.type)
    )).all()
    feedback_dist = {t: 0 for t in ("useful", "useless", "error")}
    for t, cnt in feedback_rows:
        feedback_dist[t] = cnt
    total_feedback = sum(feedback_dist.values())
    feedback_with_comment = await db.scalar(
        select(func.count())
        .select_from(Feedback)
        .where(Feedback.comment.isnot(None), func.length(Feedback.comment) > 0)
    )

    return APIResponse(
        data={
            # 兼容旧前端字段
            "total_users": total_users or 0,
            "total_courses": total_courses or 0,
            "total_docs": total_docs or 0,
            "pending_docs": doc_status_dist["pending"],
            "total_qa": total_qa or 0,
            "today_qa": today_qa or 0,
            # 新增聚合
            "user_role_dist": user_role_dist,
            "doc_status_dist": doc_status_dist,
            "rejected_qa": rejected_qa or 0,
            "feedback": {
                "total": total_feedback,
                "useful": feedback_dist["useful"],
                "useless": feedback_dist["useless"],
                "error": feedback_dist["error"],
                "with_comment": feedback_with_comment or 0,
            },
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
# Batch 请求模型
# ═══════════════════════════════════════════════════════════════════════


class BatchUserIdsRequest(BaseModel):
    user_ids: list[int]


class BatchRoleRequest(BaseModel):
    user_ids: list[int]
    role: str


class BatchStatusRequest(BaseModel):
    user_ids: list[int]
    is_active: bool


# ═══════════════════════════════════════════════════════════════════════
# PUT /admin/users/batch/role
# ═══════════════════════════════════════════════════════════════════════


@router.put("/admin/users/batch/role")
async def admin_batch_change_role(
    body: BatchRoleRequest,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role("admin")),
):
    """批量修改用户角色"""
    if body.role not in VALID_ROLES:
        return APIResponse(code=40001, message=f"无效的角色: {body.role}")
    if not body.user_ids:
        return APIResponse(code=40003, message="用户列表不能为空")
    if _user.id in body.user_ids:
        return APIResponse(code=40002, message="不能修改自己的角色")

    await db.execute(
        update(User).where(User.id.in_(body.user_ids)).values(role=body.role)
    )
    await db.commit()

    await log_action(db, _user.id, "batch_change_role", {
        "user_ids": body.user_ids, "role": body.role,
    })

    return APIResponse(
        message=f"已将 {len(body.user_ids)} 个用户的角色变更为 {body.role}",
        data={"affected": len(body.user_ids)},
    )


# ═══════════════════════════════════════════════════════════════════════
# PUT /admin/users/batch/status
# ═══════════════════════════════════════════════════════════════════════


@router.put("/admin/users/batch/status")
async def admin_batch_change_status(
    body: BatchStatusRequest,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role("admin")),
):
    """批量启用/禁用用户"""
    if not body.user_ids:
        return APIResponse(code=40003, message="用户列表不能为空")
    if _user.id in body.user_ids:
        return APIResponse(code=40002, message="不能修改自己的状态")

    await db.execute(
        update(User).where(User.id.in_(body.user_ids)).values(is_active=body.is_active)
    )
    await db.commit()

    await log_action(db, _user.id, "batch_toggle_user", {
        "user_ids": body.user_ids, "is_active": body.is_active,
    })

    action = "启用" if body.is_active else "禁用"
    return APIResponse(
        message=f"已{action} {len(body.user_ids)} 个用户",
        data={"affected": len(body.user_ids)},
    )


# ═══════════════════════════════════════════════════════════════════════
# POST /admin/users/batch/reset-password
# ═══════════════════════════════════════════════════════════════════════


@router.post("/admin/users/batch/reset-password")
async def admin_batch_reset_password(
    body: BatchUserIdsRequest,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role("admin")),
):
    """批量重置用户密码"""
    if not body.user_ids:
        return APIResponse(code=40003, message="用户列表不能为空")

    await db.execute(
        update(User)
        .where(User.id.in_(body.user_ids))
        .values(password_hash=hash_password(RESET_PASSWORD), force_password_change=True)
    )
    await db.commit()

    await log_action(db, _user.id, "batch_reset_password", {
        "user_ids": body.user_ids,
    })

    return APIResponse(
        message=f"已重置 {len(body.user_ids)} 个用户的密码为 {RESET_PASSWORD}",
        data={"affected": len(body.user_ids)},
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

    await log_action(db, _user.id, "toggle_user", {
        "user_id": user_id, "username": target.username, "is_active": target.is_active,
    })

    return APIResponse(
        message=f"用户已{'启用' if target.is_active else '禁用'}",
        data={"user_id": user_id, "is_active": target.is_active},
    )


# ═══════════════════════════════════════════════════════════════════════
# PUT /admin/users/{id}/role
# ═══════════════════════════════════════════════════════════════════════


class RoleChangeRequest(BaseModel):
    role: str


VALID_ROLES = {"student", "teacher", "admin"}


@router.put("/admin/users/{user_id}/role")
async def admin_change_role(
    user_id: int,
    body: RoleChangeRequest,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role("admin")),
):
    """修改用户角色"""
    if body.role not in VALID_ROLES:
        return APIResponse(code=40001, message=f"无效的角色: {body.role}")

    target = await db.get(User, user_id)
    if not target:
        return APIResponse(code=40401, message="用户不存在")

    if target.id == _user.id:
        return APIResponse(code=40002, message="不能修改自己的角色")

    old_role = target.role
    target.role = body.role
    await db.commit()

    await log_action(db, _user.id, "change_role", {
        "user_id": user_id, "username": target.username,
        "old_role": old_role, "new_role": body.role,
    })

    return APIResponse(
        message=f"角色已从 {old_role} 变更为 {body.role}",
        data={"user_id": user_id, "old_role": old_role, "new_role": body.role},
    )


# ═══════════════════════════════════════════════════════════════════════
# POST /admin/users/{id}/reset-password
# ═══════════════════════════════════════════════════════════════════════


RESET_PASSWORD = "123456"


@router.post("/admin/users/{user_id}/reset-password")
async def admin_reset_password(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role("admin")),
):
    """管理员重置用户密码为固定密码"""
    target = await db.get(User, user_id)
    if not target:
        return APIResponse(code=40401, message="用户不存在")

    target.password_hash = hash_password(RESET_PASSWORD)
    target.force_password_change = True
    await db.commit()

    await log_action(db, _user.id, "reset_password", {
        "user_id": user_id, "username": target.username,
    })

    return APIResponse(
        message=f"密码已重置为 {RESET_PASSWORD}",
        data={"user_id": user_id, "temp_password": RESET_PASSWORD},
    )


# ═══════════════════════════════════════════════════════════════════════
# GET /admin/audit-logs
# ═══════════════════════════════════════════════════════════════════════


@router.get("/admin/audit-logs")
async def admin_list_audit_logs(
    user_id: int | None = Query(None, description="按操作者 ID 筛选"),
    action: str | None = Query(None, description="按动作类型筛选（精确匹配）"),
    start_date: datetime | None = Query(None, description="起始时间（ISO 8601）"),
    end_date: datetime | None = Query(None, description="截止时间（ISO 8601）"),
    keyword: str | None = Query(None, description="按 detail JSON 文本模糊搜索"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role("admin")),
):
    """管理端操作日志列表（支持多条件检索）"""
    try:
        filters = []
        if user_id is not None:
            filters.append(AuditLog.user_id == user_id)
        if action:
            filters.append(AuditLog.action == action)
        if start_date is not None:
            # PG 列是 naive DateTime（服务器时区），来自接口的 tz-aware 直接比较即可
            sd = start_date.replace(tzinfo=None) if start_date.tzinfo else start_date
            filters.append(AuditLog.created_at >= sd)
        if end_date is not None:
            ed = end_date.replace(tzinfo=None) if end_date.tzinfo else end_date
            filters.append(AuditLog.created_at <= ed)
        if keyword:
            # JSONB → text 后做 ILIKE 模糊匹配
            filters.append(cast(AuditLog.detail, sa_text_type()).ilike(f"%{keyword}%"))

        base = select(AuditLog)
        if filters:
            base = base.where(*filters)

        count_q = select(func.count()).select_from(base.subquery())
        total = (await db.execute(count_q)).scalar() or 0
        total_pages = max(1, (total + page_size - 1) // page_size)

        q = (
            base
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
                        "detail": l.detail,
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
        import logging
        logging.getLogger(__name__).exception("audit-logs query failed")
        return APIResponse(
            data=PaginatedData(items=[], total=0, page=page, page_size=page_size, total_pages=0).model_dump()
        )


def sa_text_type():
    """JSONB → text 的安全转换类型（PG ``::text``）"""
    from sqlalchemy import Text
    return Text


# ═══════════════════════════════════════════════════════════════════════
# GET /admin/audit-logs/actions — 已存在的动作列表（用于前端筛选下拉）
# ═══════════════════════════════════════════════════════════════════════


@router.get("/admin/audit-logs/actions")
async def admin_audit_log_actions(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role("admin")),
):
    """返回审计日志中所有曾出现的 action 类型，供前端筛选下拉用"""
    rows = (await db.execute(
        select(AuditLog.action, func.count(AuditLog.id))
        .group_by(AuditLog.action)
        .order_by(func.count(AuditLog.id).desc())
    )).all()
    return APIResponse(data=[
        {"action": a, "count": c} for a, c in rows
    ])


# ═══════════════════════════════════════════════════════════════════════
# GET /qa/insights — 课程维度高频问题 / 未解答清单
# ═══════════════════════════════════════════════════════════════════════


@router.get("/qa/insights")
async def qa_course_insights(
    course_id: int | None = Query(None, description="按课程聚合；不传则全局"),
    days: int = Query(30, ge=1, le=365, description="时间窗口（天）"),
    top_k: int = Query(10, ge=1, le=50, description="返回 top N"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "teacher")),
):
    """问答洞察：高频问题 + 未解答问题清单（教师 / 管理员）

    - 高频问题：按问题文本聚合计数，截至前 ``top_k`` 条
    - 未解答问题：``is_rejected = true`` 或 sources 为空的问题，按时间倒序前 ``top_k`` 条
    - course_id 维度匹配方式：QAHistory.course_id 直接相等 **或** sources JSONB 中
      引用的文档所属课程匹配（与 ``GET /qa`` 的语义一致）
    - 教师默认仅看自己授课课程的洞察；管理员可看全部
    """
    # 时间窗口下限（naive，匹配 DB 列）
    from datetime import timedelta
    window_start = datetime.now() - timedelta(days=days)

    course_filter = None
    if course_id is not None:
        if user.role == "teacher":
            # 教师必须是该课程的授课教师
            course = await db.scalar(
                select(Course).where(Course.id == course_id, Course.is_deleted == False)  # noqa: E712
            )
            if course is None:
                return APIResponse(code=40401, message="课程不存在")
            if course.teacher_id != user.id:
                return APIResponse(code=40301, message="仅授课教师或管理员可查看该课程的问答洞察")

        # 课程匹配条件：QAHistory.course_id == course_id  OR
        # EXISTS (sources 中存在 document_id 指向该课程的文档)
        src = func.jsonb_array_elements(QAHistory.sources).column_valued("src")
        course_doc_exists = (
            select(1)
            .where(
                Document.id == cast(src.op("->>")("document_id"), Integer),
                Document.course_id == course_id,
            )
            .correlate(QAHistory)
            .exists()
        )
        from sqlalchemy import or_
        course_filter = or_(QAHistory.course_id == course_id, course_doc_exists)

    elif user.role == "teacher":
        # 教师不传 course_id：只看自己授课课程范围内的问答
        teacher_course_ids = [
            row[0] for row in (await db.execute(
                select(Course.id).where(Course.teacher_id == user.id, Course.is_deleted == False)  # noqa: E712
            )).all()
        ]
        if not teacher_course_ids:
            return APIResponse(data={
                "course_id": None,
                "days": days,
                "frequent_questions": [],
                "unanswered_questions": [],
                "stats": {"total_qa": 0, "rejected_qa": 0, "unique_questions": 0},
            })
        src = func.jsonb_array_elements(QAHistory.sources).column_valued("src")
        course_doc_exists = (
            select(1)
            .where(
                Document.id == cast(src.op("->>")("document_id"), Integer),
                Document.course_id.in_(teacher_course_ids),
            )
            .correlate(QAHistory)
            .exists()
        )
        from sqlalchemy import or_
        course_filter = or_(QAHistory.course_id.in_(teacher_course_ids), course_doc_exists)

    base_filters = [QAHistory.created_at >= window_start]
    if course_filter is not None:
        base_filters.append(course_filter)

    # ── 高频问题：按问题文本聚合（截断到 200 字符避免 group key 爆炸）──
    q_text = func.substring(QAHistory.question, 1, 200).label("q_text")
    freq_stmt = (
        select(
            q_text,
            func.count(QAHistory.id).label("ask_count"),
            func.max(QAHistory.created_at).label("last_asked_at"),
            func.sum(cast(QAHistory.is_rejected, Integer)).label("rejected_count"),
        )
        .where(*base_filters)
        .group_by(q_text)
        .order_by(func.count(QAHistory.id).desc())
        .limit(top_k)
    )
    freq_rows = (await db.execute(freq_stmt)).all()

    # ── 未解答清单：按时间倒序的拒答记录（去重到 top_k 个唯一问题）──
    unanswered_stmt = (
        select(
            q_text,
            func.count(QAHistory.id).label("ask_count"),
            func.max(QAHistory.created_at).label("last_asked_at"),
        )
        .where(*base_filters, QAHistory.is_rejected == True)  # noqa: E712
        .group_by(q_text)
        .order_by(func.max(QAHistory.created_at).desc())
        .limit(top_k)
    )
    unanswered_rows = (await db.execute(unanswered_stmt)).all()

    # ── 总体统计 ──
    total_qa = (await db.execute(
        select(func.count()).select_from(QAHistory).where(*base_filters)
    )).scalar() or 0
    rejected_qa = (await db.execute(
        select(func.count()).select_from(QAHistory).where(*base_filters, QAHistory.is_rejected == True)  # noqa: E712
    )).scalar() or 0
    unique_questions = (await db.execute(
        select(func.count(func.distinct(q_text))).select_from(QAHistory).where(*base_filters)
    )).scalar() or 0

    def _serialize_row(r, include_rejected: bool = False) -> dict:
        item = {
            "question": r.q_text,
            "ask_count": int(r.ask_count or 0),
            "last_asked_at": r.last_asked_at.isoformat() if r.last_asked_at else None,
        }
        if include_rejected:
            item["rejected_count"] = int(r.rejected_count or 0)
        return item

    return APIResponse(data={
        "course_id": course_id,
        "days": days,
        "frequent_questions": [_serialize_row(r, include_rejected=True) for r in freq_rows],
        "unanswered_questions": [_serialize_row(r) for r in unanswered_rows],
        "stats": {
            "total_qa": total_qa,
            "rejected_qa": rejected_qa,
            "unique_questions": unique_questions,
        },
    })

"""反馈管理 API 路由"""

import math
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.deps import get_current_user
from app.models import Feedback, QAHistory, User
from app.schemas.common import APIResponse, PaginatedData
from app.schemas.feedback import FeedbackCreate, FeedbackItem

router = APIRouter(prefix="", tags=["feedback"])


# ── endpoints ────────────────────────────────────────────────────────


@router.post("/feedback", response_model=APIResponse)
async def create_feedback(
    body: FeedbackCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """提交反馈（所有登录用户），同一用户对同一 QA 只能提交一次"""
    # 验证 QA 是否存在
    result = await db.execute(
        select(QAHistory).where(QAHistory.id == body.qa_id)
    )
    qa = result.scalar_one_or_none()
    if qa is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="QA 记录不存在",
        )

    # 创建反馈
    feedback = Feedback(
        qa_id=body.qa_id,
        user_id=user.id,
        type=body.type,
        comment=body.comment,
    )
    db.add(feedback)

    try:
        await db.commit()
        await db.refresh(feedback)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="您已对该 QA 提交过反馈，不能重复提交",
        )

    return APIResponse(
        message="反馈提交成功",
        data=FeedbackItem.model_validate(feedback).model_dump(),
    )


@router.get("/feedback", response_model=APIResponse)
async def list_feedbacks(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """当前用户的反馈列表（分页）"""
    base = select(Feedback).where(Feedback.user_id == user.id)

    # 总数
    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    # 分页查询
    q = (
        base
        .order_by(Feedback.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await db.execute(q)
    feedbacks = result.scalars().all()

    items = [FeedbackItem.model_validate(f).model_dump() for f in feedbacks]

    return APIResponse(
        data=PaginatedData(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=math.ceil(total / page_size) if total else 0,
        ).model_dump(),
    )


@router.get("/feedback/stats", response_model=APIResponse)
async def feedback_stats(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """当前用户各类型反馈数量统计"""
    q = (
        select(Feedback.type, func.count(Feedback.id))
        .where(Feedback.user_id == user.id)
        .group_by(Feedback.type)
    )
    result = await db.execute(q)
    rows = result.all()

    # 构建统计结果，确保三种类型都出现（默认 0）
    stats: dict[str, int] = defaultdict(int)
    for t, cnt in rows:
        stats[t] = cnt
    stats.setdefault("useful", 0)
    stats.setdefault("useless", 0)
    stats.setdefault("error", 0)

    return APIResponse(data=dict(stats))

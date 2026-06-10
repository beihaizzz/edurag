"""课程 CRUD API 路由"""

import math

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.database import get_db
from app.deps import get_current_user, require_role
from app.models import Course, User
from app.schemas.common import APIResponse, PaginatedData
from app.schemas.course import CourseCreate, CourseDetail, CourseItem, CourseUpdate

router = APIRouter(prefix="", tags=["courses"])


# ── helpers ──────────────────────────────────────────────────────────

def _course_to_item(course: Course) -> CourseItem:
    """ORM Course → CourseItem（含 document_count）"""
    item = CourseItem.model_validate(course)
    item.document_count = len(course.documents) if course.documents else 0
    return item


def _course_to_detail(course: Course) -> CourseDetail:
    """ORM Course → CourseDetail（含 teacher + document_count）"""
    detail = CourseDetail.model_validate(course)
    detail.document_count = len(course.documents) if course.documents else 0
    return detail


# ── endpoints ────────────────────────────────────────────────────────

@router.post("/courses", response_model=APIResponse)
async def create_course(
    body: CourseCreate,
    user: User = Depends(require_role("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    """创建课程（教师/admin），当前用户自动成为授课教师"""
    course = Course(
        name=body.name,
        semester=body.semester,
        description=body.description,
        teacher_id=user.id,
    )
    db.add(course)
    await db.commit()
    await db.refresh(course)

    # 重新加载关联数据
    result = await db.execute(
        select(Course)
        .options(joinedload(Course.teacher), joinedload(Course.documents))
        .where(Course.id == course.id)
    )
    course = result.unique().scalar_one()

    return APIResponse(
        message="课程创建成功",
        data=_course_to_detail(course).model_dump(),
    )


@router.get("/courses", response_model=APIResponse)
async def list_courses(
    semester: str | None = Query(None, description="按学期筛选"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """课程列表（所有登录用户可访问），支持分页 + 学期筛选"""
    base = select(Course).where(Course.is_deleted == False)

    if semester:
        base = base.where(Course.semester == semester)

    # 总数
    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    # 分页查询
    q = (
        base
        .options(joinedload(Course.teacher), joinedload(Course.documents))
        .order_by(Course.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await db.execute(q)
    courses = result.unique().scalars().all()

    items = [_course_to_item(c).model_dump() for c in courses]

    return APIResponse(
        data=PaginatedData(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=math.ceil(total / page_size) if total else 0,
        ).model_dump(),
    )


@router.get("/courses/{course_id}", response_model=APIResponse)
async def get_course(
    course_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """课程详情（所有登录用户可访问）"""
    result = await db.execute(
        select(Course)
        .options(joinedload(Course.teacher), joinedload(Course.documents))
        .where(Course.id == course_id, Course.is_deleted == False)
    )
    course = result.unique().scalar_one_or_none()

    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="课程不存在")

    return APIResponse(data=_course_to_detail(course).model_dump())


@router.put("/courses/{course_id}", response_model=APIResponse)
async def update_course(
    course_id: int,
    body: CourseUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """更新课程（授课教师或 admin），部分更新"""
    result = await db.execute(
        select(Course)
        .options(joinedload(Course.teacher), joinedload(Course.documents))
        .where(Course.id == course_id, Course.is_deleted == False)
    )
    course = result.unique().scalar_one_or_none()

    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="课程不存在")

    # 权限：授课教师 或 admin
    if user.role != "admin" and course.teacher_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="仅授课教师或管理员可修改")

    # 部分更新
    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(course, key, value)

    await db.commit()
    await db.refresh(course)

    # 重新加载关联数据
    result = await db.execute(
        select(Course)
        .options(joinedload(Course.teacher), joinedload(Course.documents))
        .where(Course.id == course.id)
    )
    course = result.unique().scalar_one()

    return APIResponse(
        message="课程更新成功",
        data=_course_to_detail(course).model_dump(),
    )


@router.delete("/courses/{course_id}", response_model=APIResponse)
async def delete_course(
    course_id: int,
    user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """软删除课程（仅 admin）"""
    result = await db.execute(
        select(Course).where(Course.id == course_id, Course.is_deleted == False)
    )
    course = result.scalar_one_or_none()

    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="课程不存在")

    course.is_deleted = True
    await db.commit()

    return APIResponse(message="课程已删除")

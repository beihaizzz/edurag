"""认证 API 路由 — register / login / refresh / me / password"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.deps import get_current_user
from app.models.user import User
from app.schemas.user import (
    APIResponse,
    ChangePasswordRequest,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    UserInfo,
)

router = APIRouter(prefix="/api/v1/auth", tags=["认证"])

security_scheme = HTTPBearer()


@router.post("/register", response_model=APIResponse)
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """用户注册（默认 student 角色）"""
    # 检查用户名是否已存在
    result = await db.execute(select(User).where(User.username == req.username))
    if result.scalar_one_or_none() is not None:
        return APIResponse(code=40001, message="学号/工号已存在")

    # 创建用户
    user = User(
        username=req.username,
        password_hash=hash_password(req.password),
        role="student",
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)

    return APIResponse(
        message="注册成功",
        data={
            "user": UserInfo.model_validate(user).model_dump(),
        },
    )


@router.post("/login", response_model=APIResponse)
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    """用户登录，返回 access_token + refresh_token"""
    # 查找用户
    result = await db.execute(select(User).where(User.username == req.username))
    user = result.scalar_one_or_none()

    if user is None or not verify_password(req.password, user.password_hash):
        return APIResponse(code=40002, message="学号/工号或密码错误")

    if not user.is_active:
        return APIResponse(code=40003, message="账号已被禁用，请联系管理员")

    # 生成 tokens
    access_token = create_access_token(data={"sub": user.id, "role": user.role})
    refresh_token = create_refresh_token(data={"sub": user.id, "role": user.role})

    return APIResponse(
        data={
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            "user": UserInfo.model_validate(user).model_dump(),
            "require_password_change": user.force_password_change,
        }
    )


@router.post("/refresh", response_model=APIResponse)
async def refresh_token(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    db: AsyncSession = Depends(get_db),
):
    """使用 refresh_token 刷新 access_token"""
    payload = decode_token(credentials.credentials)
    if not payload or payload.get("type") != "refresh":
        return APIResponse(code=40004, message="Refresh token 无效或已过期")

    user_id = int(payload.get("sub"))
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None or not user.is_active:
        return APIResponse(code=40004, message="用户不存在或已被禁用")

    new_access = create_access_token(data={"sub": user.id, "role": user.role})
    new_refresh = create_refresh_token(data={"sub": user.id, "role": user.role})

    return APIResponse(
        data={
            "access_token": new_access,
            "refresh_token": new_refresh,
            "token_type": "bearer",
            "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        }
    )


@router.get("/me", response_model=APIResponse)
async def get_me(user: User = Depends(get_current_user)):
    """获取当前登录用户信息"""
    return APIResponse(data={"user": UserInfo.model_validate(user).model_dump()})


@router.put("/password", response_model=APIResponse)
async def change_password(
    req: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """修改密码（需旧密码验证）"""
    if not verify_password(req.old_password, user.password_hash):
        return APIResponse(code=40005, message="旧密码错误")

    user.password_hash = hash_password(req.new_password)
    await db.flush()

    return APIResponse(message="密码修改成功")


@router.post("/reset-password", response_model=APIResponse)
async def reset_password(
    req: ResetPasswordRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """强制修改密码（管理员重置后，无需旧密码）"""
    if not user.force_password_change:
        return APIResponse(code=40006, message="无需强制修改密码")

    user.password_hash = hash_password(req.new_password)
    user.force_password_change = False
    await db.flush()

    return APIResponse(message="密码修改成功，请重新登录")

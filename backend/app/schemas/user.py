"""认证模块 Pydantic 模型"""

from datetime import datetime

from pydantic import BaseModel, Field


# ── 请求体 ─────────────────────────────────────────


class RegisterRequest(BaseModel):
    """用户注册请求"""
    username: str = Field(..., min_length=1, max_length=64, description="学号/工号")
    password: str = Field(..., min_length=6, max_length=128, description="密码，至少 6 位")


class LoginRequest(BaseModel):
    """用户登录请求"""
    username: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1)


class RefreshRequest(BaseModel):
    """Token 刷新请求"""
    refresh_token: str = Field(..., description="有效的 refresh token")


class ChangePasswordRequest(BaseModel):
    """修改密码请求"""
    old_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=6, max_length=128)


class ResetPasswordRequest(BaseModel):
    """强制改密请求（仅 force_password_change 时可用，无需旧密码）"""
    new_password: str = Field(..., min_length=6, max_length=128)


# ── 响应体 ─────────────────────────────────────────


class TokenResponse(BaseModel):
    """JWT Token 响应"""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class UserInfo(BaseModel):
    """当前用户信息"""
    id: int
    username: str
    role: str
    real_name: str = ""
    email: str | None = None
    force_password_change: bool = False
    is_active: bool = True
    created_at: datetime | None = None

    model_config = {"from_attributes": True}

"""
EduRAG - 校园课程资料智能检索与问答服务系统
FastAPI 应用入口
"""

import asyncio
import sys

# Windows: psycopg 异步模式必须使用 SelectorEventLoop
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.admin import router as admin_router
from app.api.v1.auth import router as auth_router
from app.api.v1.courses import router as courses_router
from app.api.v1.documents import router as documents_router
from app.api.v1.feedback import router as feedback_router
from app.api.v1.qa import router as qa_router
from app.api.v1.search import router as search_router
from app.core.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    yield


app = FastAPI(
    title="EduRAG API",
    description="校园课程资料智能检索与问答服务系统",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS 中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(auth_router)  # prefix already in router: /api/v1/auth
app.include_router(courses_router, prefix="/api/v1")
app.include_router(documents_router, prefix="/api/v1")
app.include_router(search_router, prefix="/api/v1")
app.include_router(qa_router, prefix="/api/v1")
app.include_router(feedback_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1")


@app.get("/health")
async def health_check():
    """健康检查端点"""
    return {"status": "ok", "version": "0.1.0"}

"""
EduRAG - 校园课程资料智能检索与问答服务系统
FastAPI 应用入口
"""

import asyncio
import logging
import sys

# Windows: psycopg 异步模式必须使用 SelectorEventLoop
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

# Configure root logger so logger.info() calls in app.* modules actually
# emit. Without this, Python's default WARNING level silently drops all
# INFO logs from the RAG graph, making debugging impossible.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    force=True,  # override any prior basicConfig (e.g. from SQLAlchemy)
)
# Also write to file for Sisyphus to inspect. Idempotent across uvicorn
# --reload restarts: replace any prior FileHandler instead of accumulating.
_root = logging.getLogger()
for _h in list(_root.handlers):
    if isinstance(_h, logging.FileHandler):
        _root.removeHandler(_h)
        _h.close()
_file_handler = logging.FileHandler("logs/app.log", mode="a", encoding="utf-8")
_file_handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s [%(name)s] %(message)s"))
_root.addHandler(_file_handler)
# Quiet down SQLAlchemy engine spam — we already see it via its own logger
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

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

# Force docling/torch to initialize on the main thread at startup (before the
# event loop serves requests). Avoids "torch has no attribute 'backends'" that
# occurs when docling is first imported lazily inside a request handler.
import app.services.document_processor  # noqa: E402, F401


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

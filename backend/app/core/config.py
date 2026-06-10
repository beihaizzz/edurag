"""应用配置管理（pydantic-settings）"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """全局配置"""

    # ── 应用 ──────────────────────────────────
    APP_NAME: str = "EduRAG"
    DEBUG: bool = True

    # ── 数据库 ────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://eduraq:eduraq@localhost:5432/eduraq"
    DATABASE_URL_SYNC: str = "postgresql://eduraq:eduraq@localhost:5432/eduraq"

    # ── JWT ──────────────────────────────────
    SECRET_KEY: str = "dev-secret-change-in-production-32chars"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ── DeepSeek LLM ────────────────────────
    DEEPSEEK_API_KEY: str = ""
    DEEPSEEK_MODEL: str = "deepseek-v4-flash"

    # ── Embedding ────────────────────────────
    EMBEDDING_MODEL: str = "BAAI/bge-large-zh-v1.5"
    EMBEDDING_DEVICE: str = "cpu"

    # ── 文件上传 ─────────────────────────────
    UPLOAD_DIR: str = "./data/files"
    MAX_UPLOAD_SIZE_MB: int = 50
    ALLOWED_EXTENSIONS: str = "pdf,docx,txt,pptx,md,jpg,png,jpeg"

    # ── ChromaDB ─────────────────────────────
    CHROMA_PERSIST_DIR: str = "./data/chroma"

    # ── RAG 参数 ─────────────────────────────
    RAG_SIMILARITY_THRESHOLD: float = 0.45
    RAG_TOP_K: int = 10
    RAG_CHUNK_SIZE: int = 800
    RAG_CHUNK_OVERLAP: int = 150

    # ── 安全 ─────────────────────────────────
    PII_DETECTION_ENABLED: bool = True
    PROMPT_INJECTION_DETECTION_ENABLED: bool = True

    # ── CORS ─────────────────────────────────
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:5174"]

    # ── 管理员初始化 ─────────────────────────
    ADMIN_USERNAME: str = "admin001"
    ADMIN_PASSWORD: str = "Admin@123"

    # ── 日志 ─────────────────────────────────
    LOG_LEVEL: str = "INFO"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "allow"}


settings = Settings()

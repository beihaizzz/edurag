"""应用配置管理（pydantic-settings）"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """全局配置"""

    # ── 应用 ──────────────────────────────────
    APP_NAME: str = "EduRAG"
    DEBUG: bool = True

    # Timezone used to interpret naive datetimes read from / written to
    # the database. The PG server is configured for Asia/Shanghai and
    # ``func.now()`` writes naive timestamps in that local timezone into
    # ``DateTime`` (no tz) columns. Set this to match the PG server's
    # ``timezone`` setting so the API can correctly convert naive DB
    # timestamps to absolute UTC ISO-8601 strings for the frontend.
    SERVER_TIMEZONE: str = "Asia/Shanghai"

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
    # provider: "siliconflow"（推荐）| "local"（需下载模型）
    EMBEDDING_PROVIDER: str = "siliconflow"
    EMBEDDING_MODEL: str = "BAAI/bge-m3"
    EMBEDDING_DEVICE: str = "cpu"
    EMBEDDING_DIM: int = 1024

    # SiliconFlow API（EMBEDDING_PROVIDER=siliconflow 时使用）
    SILICONFLOW_API_KEY: str = ""
    SILICONFLOW_BASE_URL: str = "https://api.siliconflow.cn/v1"

    # ── 文件上传 ─────────────────────────────
    UPLOAD_DIR: str = "./data/files"
    MAX_UPLOAD_SIZE_MB: int = 50
    ALLOWED_EXTENSIONS: str = "pdf,docx,txt,pptx,md,jpg,png,jpeg"

    # ── ChromaDB ─────────────────────────────
    CHROMA_PERSIST_DIR: str = "./data/chroma"

    # ── RAG 参数 ─────────────────────────────
    RAG_SIMILARITY_THRESHOLD: float = 0.45
    # 粗筛阈值：rag_search 召回阶段仅去除极端噪音，真正的相关性判定交给 rerank
    RAG_PREFILTER_THRESHOLD: float = 0.2
    # 降级阈值：rerank API 挂掉时（fail-open）改用更严格的余弦阈值判定是否有内部资料
    RAG_FALLBACK_THRESHOLD: float = 0.55
    RAG_TOP_K: int = 10
    RAG_CHUNK_SIZE: int = 800
    RAG_CHUNK_OVERLAP: int = 150

    # ── Reranker (SiliconFlow bge-reranker-v2-m3) ──
    RERANK_ENABLED: bool = True
    RERANK_FETCH_K: int = 20
    RERANK_TOP_K: int = 5
    # rerank 后的相关性阈值：relevance_score 低于此值视为无内部资料（决定是否走联网/兜底）
    RERANK_SCORE_THRESHOLD: float = 0.3
    RERANKER_TIMEOUT: float = 10.0
    RERANKER_MODEL: str = "BAAI/bge-reranker-v2-m3"

    # ── Query Rewrite（多轮追问改写）─────────
    # When True, the rewrite_query node uses the LLM to expand follow-up
    # questions like "可以更详细的讲讲吗" into self-contained search
    # queries before vector retrieval. Disable to fall back to the raw
    # current-turn question (current = behaviour before this feature).
    QUERY_REWRITE_ENABLED: bool = True
    # Max conversation turns to feed into the rewrite prompt (each turn =
    # user + assistant pair). Keeping this small keeps the rewrite call
    # fast and cheap; the most recent turn is usually the only one the
    # follow-up refers to.
    QUERY_REWRITE_HISTORY_TURNS: int = 3

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

    # ── Tavily Web Search ───────────────────────
    TAVILY_API_KEY: str = ""
    TAVILY_MAX_RESULTS: int = 5
    TAVILY_SEARCH_TIMEOUT: float = 10.0

    # ── LangGraph Checkpointer ──────────────────
    CHECKPOINT_TYPE: str = "postgres"  # "postgres" | "memory"
    CHECKPOINT_DB_URL: str = "postgresql://eduraq:eduraq@localhost:5432/eduraq"

    # ── LangSmith Tracing ──────────────────────
    LANGSMITH_TRACING: bool = False
    LANGSMITH_ENDPOINT: str = "https://api.smith.langchain.com"
    LANGSMITH_API_KEY: str = ""
    LANGSMITH_PROJECT: str = "eduraq"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "allow"}


settings = Settings()

"""
Embedding 向量化工具 — 统一接口，双 provider 支持

Provider:
  - "siliconflow": 硅基流动 API，bge-m3 (1024d)，推荐（无需下载模型）
  - "local":       本地 sentence-transformers，bge-large-zh-v1.5 (1024d)

用法:
    from app.utils.embedding import get_embedding

    emb = get_embedding()
    vec = emb.embed_query("你好世界")
    vecs = emb.embed_documents(["文本1", "文本2", "文本3"])
"""

from __future__ import annotations

import asyncio
import logging
import time
from abc import ABC, abstractmethod
from typing import List

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


# ── 抽象基类 ──────────────────────────────────────────


class BaseEmbedding(ABC):
    """Embedding 抽象基类"""

    @abstractmethod
    def embed_query(self, text: str) -> list[float]:
        """将单个查询文本转为向量"""
        ...

    @abstractmethod
    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """批量将文档文本转为向量"""
        ...

    @property
    @abstractmethod
    def dim(self) -> int:
        """向量维度"""
        ...

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Provider 名称（用于日志）"""
        ...


# ── SiliconFlow 实现 ──────────────────────────────────


class SiliconFlowEmbedding(BaseEmbedding):
    """硅基流动 Embedding API（OpenAI 兼容）"""

    def __init__(self):
        self._api_key = settings.SILICONFLOW_API_KEY
        self._base_url = settings.SILICONFLOW_BASE_URL.rstrip("/")
        self._model = settings.EMBEDDING_MODEL  # BAAI/bge-m3
        self._client = httpx.Client(
            base_url=self._base_url,
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
            },
            timeout=30.0,
            proxy=None,  # 不走系统代理（国内直连硅基流动更快）
        )

    @property
    def dim(self) -> int:
        return settings.EMBEDDING_DIM  # 1024

    @property
    def provider_name(self) -> str:
        return f"siliconflow({self._model})"

    def embed_query(self, text: str) -> list[float]:
        """单文本 → 向量"""
        results = self._batch_embed([text])
        return results[0]

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """批量文本 → 向量列表

        SiliconFlow bge-m3 单次最多 8192 token/条，
        建议外部控制批量大小（如 32 条/批）。
        """
        if not texts:
            return []
        return self._batch_embed(texts)

    def _batch_embed(self, texts: list[str]) -> list[list[float]]:
        """调用 SiliconFlow Embedding API"""
        # bge-m3 API 要求每个 input 元素 ≤ 8192 tokens，
        # 这里直接发送；超长文本应由调用方先切分。

        payload = {
            "model": self._model,
            "input": texts,
            "encoding_format": "float",
        }

        start = time.perf_counter()
        try:
            resp = self._client.post("/embeddings", json=payload)
            resp.raise_for_status()
        except httpx.HTTPError as e:
            logger.error("SiliconFlow embedding request failed: %s", e)
            raise RuntimeError(f"SiliconFlow API 调用失败: {e}") from e

        data = resp.json()
        elapsed = time.perf_counter() - start

        # 响应格式: {"data": [{"index": 0, "embedding": [...]}, ...]}
        items = sorted(data.get("data", []), key=lambda x: x["index"])
        vectors = [item["embedding"] for item in items]

        logger.debug(
            "Embedded %d texts in %.2fs (model=%s)",
            len(vectors),
            elapsed,
            self._model,
        )
        return vectors

    def __del__(self):
        if hasattr(self, "_client"):
            self._client.close()


# ── 本地 sentence-transformers 实现 ────────────────────


class LocalEmbedding(BaseEmbedding):
    """本地 sentence-transformers（离线）"""

    _instance: "LocalEmbedding | None" = None  # 单例缓存

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True

        logger.info("Loading local embedding model: %s ...", settings.EMBEDDING_MODEL)
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError:
            raise ImportError(
                "sentence-transformers 未安装，请运行: pip install sentence-transformers"
            )

        self._model = SentenceTransformer(
            settings.EMBEDDING_MODEL,
            device=settings.EMBEDDING_DEVICE,
        )
        logger.info(
            "Local embedding model loaded: %s (dim=%d)",
            settings.EMBEDDING_MODEL,
            self.dim,
        )

    @property
    def dim(self) -> int:
        return self._model.get_sentence_embedding_dimension()

    @property
    def provider_name(self) -> str:
        return f"local({settings.EMBEDDING_MODEL})"

    def embed_query(self, text: str) -> list[float]:
        return self._model.encode(text, normalize_embeddings=True).tolist()

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        vectors = self._model.encode(
            texts,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        return vectors.tolist()


# ── 工厂函数 ──────────────────────────────────────────


_embedding: BaseEmbedding | None = None


def get_embedding() -> BaseEmbedding:
    """获取 Embedding 实例（全局单例）"""
    global _embedding

    if _embedding is not None:
        return _embedding

    provider = settings.EMBEDDING_PROVIDER

    if provider == "siliconflow":
        if not settings.SILICONFLOW_API_KEY:
            raise RuntimeError(
                "EMBEDDING_PROVIDER=siliconflow 但 SILICONFLOW_API_KEY 未设置，"
                "请在 .env 中填入 SiliconFlow API Key"
            )
        _embedding = SiliconFlowEmbedding()
    elif provider == "local":
        _embedding = LocalEmbedding()
    else:
        raise ValueError(
            f"不支持的 EMBEDDING_PROVIDER: {provider}，可选值: siliconflow, local"
        )

    logger.info("Embedding provider: %s (dim=%d)", _embedding.provider_name, _embedding.dim)
    return _embedding

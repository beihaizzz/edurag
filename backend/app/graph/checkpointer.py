"""Checkpointer factory for LangGraph persistence"""

from __future__ import annotations

import logging

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

from app.core.config import settings

logger = logging.getLogger(__name__)


async def get_checkpointer() -> BaseCheckpointSaver:
    """Create and return a checkpointer based on CHECKPOINT_TYPE."""
    if settings.CHECKPOINT_TYPE == "memory":
        checkpointer = InMemorySaver()
        logger.info("InMemorySaver initialized (dev mode)")
        return checkpointer

    from psycopg import AsyncConnection

    conn = await AsyncConnection.connect(
        settings.CHECKPOINT_DB_URL or settings.DATABASE_URL,
        autocommit=True,
    )
    checkpointer = AsyncPostgresSaver(conn)
    await checkpointer.setup()
    logger.info("AsyncPostgresSaver initialized")
    return checkpointer

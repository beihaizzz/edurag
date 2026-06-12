"""Checkpointer factory for LangGraph persistence"""

from __future__ import annotations

import logging

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

from app.core.config import settings

logger = logging.getLogger(__name__)


async def get_checkpointer() -> BaseCheckpointSaver:
    """Create and return a checkpointer based on CHECKPOINT_TYPE.

    - "memory": InMemorySaver (fast, no persistence — for langgraph dev)
    - "postgres": AsyncPostgresSaver (persistent checkpointing)
    """
    if settings.CHECKPOINT_TYPE == "memory":
        checkpointer = InMemorySaver()
        logger.info("InMemorySaver initialized (dev mode)")
        return checkpointer

    # PostgreSQL checkpointer
    from psycopg import AsyncConnection

    conn = await AsyncConnection.connect(
        settings.CHECKPOINT_DB_URL or settings.DATABASE_URL,
        autocommit=True,  # required for CREATE INDEX CONCURRENTLY in setup()
    )
    checkpointer = AsyncPostgresSaver(conn)
    await checkpointer.setup()
    logger.info("AsyncPostgresSaver initialized")
    return checkpointer

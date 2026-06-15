"""操作日志服务 — 统一记录管理操作"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog


async def log_action(db: AsyncSession, user_id: int, action: str, detail: dict | None = None) -> None:
    """写入一条操作日志"""
    entry = AuditLog(user_id=user_id, action=action, detail=detail)
    db.add(entry)
    await db.commit()

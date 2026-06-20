"""彻底清理种子账号自身沉积的测试业务数据 + LangGraph checkpoint 状态。

cleanup_db.py 仅删除非种子用户的关联数据，但种子账号（admin001/T001-T003）
在测试中产生的课程/文档/问答/会话，以及 LangGraph 的 checkpoint 表均未清理。
本脚本将这些业务数据全部清空，仅保留 users 表中的种子账号，使数据库恢复到
适合手动测试的干净初始状态。

使用方式:
    cd backend
    python scripts/cleanup_db_full.py
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text
from app.core.database import engine


# 业务数据表（保留 users 与 alembic_version；按外键依赖从子到父排列）
BUSINESS_TABLES = [
    "feedback",
    "refresh_tokens",
    "qa_history",
    "user_sessions",
    "audit_logs",
    "chunks",
    "documents",
    "courses",
]

# LangGraph 持久化 checkpoint 表（保留 checkpoint_migrations 版本表）
CHECKPOINT_TABLES = [
    "checkpoint_writes",
    "checkpoint_blobs",
    "checkpoints",
]


async def cleanup():
    async with engine.begin() as conn:
        existing = {
            row[0]
            for row in await conn.execute(
                text(
                    "SELECT table_name FROM information_schema.tables "
                    "WHERE table_schema='public' AND table_type='BASE TABLE'"
                )
            )
        }

        print("── 清理前 ──")
        for t in BUSINESS_TABLES + CHECKPOINT_TABLES + ["users"]:
            if t in existing:
                c = await conn.execute(text(f'SELECT COUNT(*) FROM "{t}"'))
                print(f"  {t}: {c.scalar()}")

        # 业务表逐个 DELETE（保留 users）
        for t in BUSINESS_TABLES:
            if t in existing:
                r = await conn.execute(text(f'DELETE FROM "{t}"'))
                print(f"清空 {t}: {r.rowcount} 行")

        # checkpoint 表用 TRUNCATE（更快，无外键阻塞问题）
        for t in CHECKPOINT_TABLES:
            if t in existing:
                await conn.execute(text(f'TRUNCATE TABLE "{t}"'))
                print(f"清空 {t} (truncate)")

        print("\n── 清理后 ──")
        for t in BUSINESS_TABLES + CHECKPOINT_TABLES + ["users"]:
            if t in existing:
                c = await conn.execute(text(f'SELECT COUNT(*) FROM "{t}"'))
                print(f"  {t}: {c.scalar()}")

        users = await conn.execute(
            text("SELECT id, username, role FROM users ORDER BY id")
        )
        print(f"\n剩余用户: {[tuple(x) for x in users]}")

    print("\n✓ 彻底清理完成，数据库已恢复到干净初始状态")


if __name__ == "__main__":
    asyncio.run(cleanup())

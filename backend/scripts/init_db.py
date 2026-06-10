"""EduRAG 数据库初始化脚本

创建 admin 账号 + 导入教师工号
用法: uv run python scripts/init_db.py
"""

import asyncio
import sys

from sqlalchemy import select

from app.core.database import AsyncSessionLocal, engine, Base
from app.core.security import hash_password
from app.models.user import User


async def init_database():
    """初始化数据库：建表 + 创建默认账号"""
    print("Creating tables...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Tables created.")

    async with AsyncSessionLocal() as db:
        # ── 创建 admin 默认账号 ─────────────────
        result = await db.execute(select(User).where(User.role == "admin"))
        admin = result.scalar_one_or_none()

        if admin is None:
            admin = User(
                username="admin001",
                password_hash=hash_password("Admin@123"),
                role="admin",
                real_name="系统管理员",
                force_password_change=True,
            )
            db.add(admin)
            print("Admin account created: admin001 / Admin@123")
        else:
            print("Admin account already exists.")

        # ── 创建默认教师账号 ───────────────────
        for teacher_id in ["T001", "T002", "T003"]:
            result = await db.execute(
                select(User).where(User.username == teacher_id)
            )
            if result.scalar_one_or_none() is None:
                teacher = User(
                    username=teacher_id,
                    password_hash=hash_password("Teacher@123"),
                    role="teacher",
                    real_name=f"教师{teacher_id}",
                    force_password_change=True,
                )
                db.add(teacher)
                print(f"Teacher account created: {teacher_id} / Teacher@123")

        await db.commit()
        print("Database initialization complete.")


if __name__ == "__main__":
    asyncio.run(init_database())

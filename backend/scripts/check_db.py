"""数据库状态检查脚本"""
import asyncio
from sqlalchemy import text, select
from app.core.database import engine, AsyncSessionLocal
from app.models.user import User


async def check():
    async with engine.begin() as conn:
        tables = await conn.execute(
            text("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")
        )
        names = [r[0] for r in tables]
        print(f"Tables ({len(names)}): {names}")

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User))
        users = result.scalars().all()
        print(f"Users ({len(users)}):")
        for u in users:
            print(f"  {u.username} | {u.role} | {u.real_name} | force_pwd={u.force_password_change}")


if __name__ == "__main__":
    asyncio.run(check())

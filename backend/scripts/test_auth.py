import asyncio
from app.core.database import AsyncSessionLocal
from app.models.user import User
from app.core.security import hash_password, verify_password
from sqlalchemy import select

async def test():
    pwd = "test123"
    h = hash_password(pwd)
    print(f"Hash: {h[:20]}...")
    print(f"Verify: {verify_password(pwd, h)}")

    async with AsyncSessionLocal() as db:
        r = await db.execute(select(User).where(User.username == "admin001"))
        u = r.scalar_one_or_none()
        print(f"Admin found: {u is not None}")
        if u:
            print(f"  username={u.username}, role={u.role}")
            print(f"  verify: {verify_password('Admin@123', u.password_hash)}")

if __name__ == "__main__":
    asyncio.run(test())

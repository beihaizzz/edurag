"""Minimal auth test — simulate what the FastAPI endpoint does"""
import asyncio, traceback
from app.models import User
from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from sqlalchemy import select

async def test_register():
    try:
        async with AsyncSessionLocal() as db:
            # Check if user exists
            result = await db.execute(select(User).where(User.username == "test999"))
            existing = result.scalar_one_or_none()
            print(f"Existing user: {existing}")

            if existing is None:
                # Create user
                user = User(
                    username="test999",
                    password_hash=hash_password("test123"),
                    role="student",
                )
                db.add(user)
                print("User added to session")

                await db.flush()
                print(f"Flushed, user.id={user.id}")

                await db.refresh(user)
                print(f"Refreshed: {user}")

                # Commit!
                await db.commit()
                print("Committed!")

                print("REGISTER SUCCESS")
            else:
                print("User already exists, trying login...")

            # Test login
            result = await db.execute(select(User).where(User.username == "test999"))
            user = result.scalar_one_or_none()
            print(f"Login lookup: {user}")

    except Exception as e:
        traceback.print_exc()

asyncio.run(test_register())

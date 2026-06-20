"""清理数据库中的测试数据，保留种子账号（admin001, T001, T002, T003）。

通过 SQLAlchemy 和原生 SQL 清理所有测试过程中沉积的数据：
- 测试用户（排除种子账号）
- 测试课程、文档、chunks、QA 记录、反馈、审计日志、Session、RefreshToken

使用方式:
    cd backend
    python scripts/cleanup_db.py
"""

import asyncio
import sys
from pathlib import Path

# 确保 backend 目录在 sys.path 中
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text
from app.core.database import engine, AsyncSessionLocal


# ── 保留的种子账号 ─────────────────────────────────────────────
PRESERVE_USERNAMES = {"admin001", "T001", "T002", "T003"}


async def cleanup():
    async with engine.begin() as conn:
        # 1. 查询有哪些表
        tables_result = await conn.execute(
            text(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = 'public' AND table_type = 'BASE TABLE' "
                "ORDER BY table_name"
            )
        )
        table_names = [row[0] for row in tables_result]
        print(f"现有表 ({len(table_names)}): {', '.join(table_names)}")

        # 2. 统计当前数据量
        print("\n── 清理前数据量 ──")
        for t in table_names:
            row_count = await conn.execute(text(f'SELECT COUNT(*) FROM "{t}"'))
            count = row_count.scalar()
            print(f"  {t}: {count} 行")

        # 3. 逐步清理（按外键依赖顺序）

        # 3a. 找出要删除的测试用户 ID
        preset_ids = set()
        if "users" in table_names:
            users_result = await conn.execute(
                text("SELECT id, username FROM users")
            )
            all_users = [(row[0], row[1]) for row in users_result]
            print(f"\n所有用户: {all_users}")

            delete_user_ids = []
            for uid, uname in all_users:
                if uname not in PRESERVE_USERNAMES:
                    delete_user_ids.append(uid)
                else:
                    preset_ids.add(uid)

            print(f"保留用户 ID: {preset_ids}")
            print(f"待删除用户 ID: {delete_user_ids}")

            if not delete_user_ids:
                print("\n✓ 没有测试用户需要清理")
                return

            # 清理顺序: feedback → refresh_tokens → user_sessions → qa_history
            #           → audit_logs → chunks → documents → courses → users
            FK_ORDER = [
                ("feedback", "user_id", delete_user_ids),
                ("refresh_tokens", "user_id", delete_user_ids),
                ("user_sessions", "user_id", delete_user_ids),
                ("qa_history", "user_id", delete_user_ids),
                ("audit_logs", "user_id", delete_user_ids),
                # 清理测试用户上传的文档的 chunks
                ("chunks", "document_id",
                 None),  # 通过子查询处理
                # 清理测试用户上传的文档
                ("documents", "uploader_id", delete_user_ids),
                # 清理测试用户创建的课程
                ("courses", "teacher_id", delete_user_ids),
                # 如果 user_sessions 中有 course_id 引用了被删课程
                ("user_sessions", "course_id", None),
                ("qa_history", "course_id", None),
            ]

            total_deleted = 0
            for tbl, col, ids in FK_ORDER:
                if tbl not in table_names:
                    continue

                if ids is not None:
                    # 分批处理，避免 IN 列表过大
                    batch_size = 100
                    for i in range(0, len(ids), batch_size):
                        batch = ids[i : i + batch_size]
                        placeholders = ",".join(str(x) for x in batch)
                        result = await conn.execute(
                            text(
                                f'DELETE FROM "{tbl}" WHERE "{col}" IN ({placeholders})'
                            )
                        )
                        total_deleted += result.rowcount
                else:
                    # 对于 chunks：删除所有 document_id 不在文档表中的
                    if tbl == "chunks":
                        result = await conn.execute(
                            text(
                                'DELETE FROM chunks WHERE document_id IN ('
                                'SELECT id FROM documents WHERE uploader_id = ANY(:uids)'
                                ')'
                            ),
                            {"uids": delete_user_ids},
                        )
                        total_deleted += result.rowcount
                    elif tbl == "user_sessions" and col == "course_id":
                        # 清理引用已被删除课程的 session
                        result = await conn.execute(
                            text(
                                'DELETE FROM user_sessions WHERE course_id IN ('
                                'SELECT id FROM courses WHERE teacher_id = ANY(:uids)'
                                ')'
                            ),
                            {"uids": delete_user_ids},
                        )
                        total_deleted += result.rowcount
                    elif tbl == "qa_history" and col == "course_id":
                        result = await conn.execute(
                            text(
                                'DELETE FROM qa_history WHERE course_id IN ('
                                'SELECT id FROM courses WHERE teacher_id = ANY(:uids)'
                                ')'
                            ),
                            {"uids": delete_user_ids},
                        )
                        total_deleted += result.rowcount

            # 最后删除测试用户
            placeholders = ",".join(str(x) for x in delete_user_ids)
            result = await conn.execute(
                text(f"DELETE FROM users WHERE id IN ({placeholders})")
            )
            total_deleted += result.rowcount

            print(f"\n共删除 {total_deleted} 行数据")

        # 4. 验证清理结果
        print("\n── 清理后数据量 ──")
        for t in table_names:
            row_count = await conn.execute(text(f'SELECT COUNT(*) FROM "{t}"'))
            count = row_count.scalar()
            print(f"  {t}: {count} 行")

        # 5. 确认种子账号完好
        if "users" in table_names:
            users_result = await conn.execute(
                text("SELECT id, username, role FROM users ORDER BY id")
            )
            remaining = [(row[0], row[1], row[2]) for row in users_result]
            print(f"\n剩余用户: {remaining}")

    print("\n✓ 数据库清理完成")


if __name__ == "__main__":
    asyncio.run(cleanup())
